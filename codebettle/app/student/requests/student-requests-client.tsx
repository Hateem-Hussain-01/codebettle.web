'use client';
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Inbox, Paperclip, Send } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  REQUEST_CATEGORIES,
  REQUEST_STATUS_BADGE,
  requestCategoryLabel,
  requestStatusLabel,
  validateRequestAttachment,
  type StudentRequest,
} from '@/components/requests/request-types';

const PAGE_SIZE = 20;

interface StudentRequestsClientProps {
  enrolledCourses: { id: string; title: string }[];
}

/**
 * Student Support / Contact Admin (Phase 3, Worker C).
 * Create form (category, subject, message, optional enrolled course,
 * optional attachment ≤5 MB) posts FormData to POST /api/student/requests;
 * "My requests" lists the student's own requests from
 * GET /api/student/requests, newest first, with the admin reply when
 * present. The API enforces enrolment for the chosen course (403 when
 * not enrolled) and the file rules — the client checks only give
 * instant feedback.
 */
export default function StudentRequestsClient({ enrolledCourses }: StudentRequestsClientProps) {
  const [requests, setRequests] = useState<StudentRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(false);

  const [category, setCategory] = useState('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [courseId, setCourseId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const courseTitleFor = useCallback(
    (courseId?: string | null) => enrolledCourses.find((c) => c.id === courseId)?.title ?? null,
    [enrolledCourses],
  );

  const loadPage = useCallback(async (nextPage: number) => {
    setLoadingList(true);
    setListError(false);
    try {
      const res = await fetch(`/api/student/requests?page=${nextPage}&limit=${PAGE_SIZE}`);
      if (!res.ok) throw new Error('Failed to load requests');
      const data = await res.json();
      // The API returns bare rows (no course title); resolve it from
      // the enrolled courses passed in by the server wrapper.
      const items = (Array.isArray(data.requests) ? data.requests : []) as StudentRequest[];
      setRequests(items.map((r) => ({ ...r, courseTitle: courseTitleFor(r.courseId) })));
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setPage(nextPage);
    } catch {
      setListError(true);
    } finally {
      setLoadingList(false);
    }
  }, [courseTitleFor]);

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0] ?? null;
    setFileError('');
    if (!chosen) {
      setFile(null);
      return;
    }
    const error = validateRequestAttachment(chosen);
    if (error) {
      setFileError(error);
      setFile(null);
      e.target.value = '';
      return;
    }
    setFile(chosen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('category', category);
      formData.append('subject', subject.trim());
      formData.append('message', message.trim());
      if (courseId) formData.append('courseId', courseId);
      if (file) formData.append('attachment', file);
      const res = await fetch('/api/student/requests', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        toast.error('Too many requests — please try again in a few minutes.');
        return;
      }
      if (res.status === 413) {
        toast.error('Attachment is too large — it must be 5 MB or smaller.');
        return;
      }
      if (res.status === 403) {
        toast.error(data.error || 'You are not enrolled in the selected course.');
        return;
      }
      if (!res.ok) {
        toast.error(data.error || 'Could not send your request — please try again.');
        return;
      }
      toast.success('Request sent — the admin team will reply here.');
      setSubject('');
      setMessage('');
      setCourseId('');
      setFile(null);
      setFileError('');
      if (data && typeof data === 'object' && data.request && typeof data.request === 'object' && 'id' in data.request) {
        const created = data.request as StudentRequest;
        setRequests((r) => [{ ...created, courseTitle: courseTitleFor(created.courseId) }, ...r]);
        setTotal((t) => t + 1);
      } else {
        void loadPage(1);
      }
    } catch {
      toast.error('Could not send your request — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">Student Support</h1>
        <p className="text-muted text-sm mt-1">Contact the admin team — complaints, feedback, course issues or anything else.</p>
      </FadeIn>

      <FadeIn delay={0.05}>
        <Card>
          <h2 className="font-semibold text-foreground mb-4">New request</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Select
                label="Category"
                options={REQUEST_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              />
              <Select
                label="Related course (optional)"
                options={[
                  { value: '', label: 'No specific course' },
                  ...enrolledCourses.map((c) => ({ value: c.id, label: c.title })),
                ]}
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
              />
            </div>
            <Input
              label="Subject"
              placeholder="What is your request about?"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              maxLength={200}
            />
            <Textarea
              label="Message"
              placeholder="Describe your request in detail…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground/80">Attachment (optional, max 5 MB)</label>
              <label className="flex items-center gap-2 w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-muted hover:text-foreground hover:border-primary/40 transition-colors cursor-pointer">
                <Paperclip className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{file ? file.name : 'PDF, Word, JPG or PNG'}</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              {file && (
                <button type="button" onClick={() => setFile(null)} className="text-xs text-muted hover:text-foreground text-left w-fit cursor-pointer">
                  Remove attachment
                </button>
              )}
              {fileError && <p className="text-xs text-red-400">{fileError}</p>}
            </div>
            <Button type="submit" loading={submitting} className="gap-2">
              <Send className="w-4 h-4" /> Send request
            </Button>
          </form>
        </Card>
      </FadeIn>

      <FadeIn delay={0.1}>
        <h2 className="font-semibold text-foreground mb-3">My requests ({total})</h2>
        {loadingList ? (
          <Card className="py-10 text-center"><p className="text-muted text-sm">Loading your requests…</p></Card>
        ) : listError ? (
          <Card className="py-10 text-center">
            <p className="text-foreground font-medium">Could not load your requests</p>
            <p className="text-muted text-sm mt-1">Please refresh the page and try again.</p>
          </Card>
        ) : requests.length === 0 ? (
          <Card className="py-16 text-center">
            <Inbox className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-foreground font-medium">No requests yet</p>
            <p className="text-muted text-sm mt-1">Send your first request using the form above.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <Card key={req.id}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-foreground font-medium text-sm">{req.subject}</p>
                    <p className="text-muted text-xs mt-0.5">
                      {requestCategoryLabel(req.category)}
                      {req.courseTitle ? ` · ${req.courseTitle}` : ''} · {formatDateShort(req.createdAt)}
                    </p>
                  </div>
                  <Badge variant={REQUEST_STATUS_BADGE[req.status as keyof typeof REQUEST_STATUS_BADGE] ?? 'muted'}>
                    {requestStatusLabel(req.status)}
                  </Badge>
                </div>
                <p className="text-muted text-sm mt-2 whitespace-pre-line">{req.message}</p>
                {req.adminReply && (
                  <div className="mt-3 rounded-lg bg-primary/5 border border-primary/20 p-3">
                    <p className="text-primary-text text-xs font-semibold">Reply from admin</p>
                    <p className="text-foreground/90 text-sm mt-1 whitespace-pre-line">{req.adminReply}</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <Button variant="secondary" size="sm" disabled={page <= 1 || loadingList} onClick={() => void loadPage(page - 1)}>
              <ChevronLeft className="w-4 h-4" />Previous
            </Button>
            <p className="text-muted text-xs">Page {page} of {totalPages}</p>
            <Button variant="secondary" size="sm" disabled={page >= totalPages || loadingList} onClick={() => void loadPage(page + 1)}>
              Next<ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </FadeIn>
    </div>
  );
}
