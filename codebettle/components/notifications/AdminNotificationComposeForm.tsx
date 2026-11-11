'use client';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Search, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import toast from 'react-hot-toast';
import type { Course } from '@/lib/db/types';
import {
  buildComposePayload,
  COMPOSE_CATEGORIES,
  defaultRequiresAcknowledge,
  type ComposeFormState,
  type ComposeRole,
  type ComposeTargetType,
  type NotificationCategory,
} from './notification-helpers';

interface ComposeFormProps {
  /** All courses, loaded server-side by the compose page. */
  courses: Course[];
}

interface UserPick {
  id: string;
  name: string;
  email: string;
}

/**
 * Admin notification compose form (Phase 3, Worker B).
 *
 * Sends via POST /api/admin/notifications (Worker A). The server
 * enforces the admin gate and validates the target — this form only
 * mirrors those checks for a better error message.
 *
 * Specific-user search reuses the existing admin user-search endpoint
 * (GET /api/admin/users?search=). That endpoint lists students only
 * (role=student, requires the `students` area), so the picker can only
 * find registered students; a 403 there means the admin lacks the
 * students area, and the picker explains that instead of failing
 * silently.
 */
const TARGET_OPTIONS: { value: ComposeTargetType; label: string }[] = [
  { value: 'all', label: 'All users' },
  { value: 'role', label: 'By role…' },
  { value: 'user', label: 'Specific user…' },
  { value: 'course', label: "Specific course's enrolled students…" },
];

const ROLE_OPTIONS: { value: ComposeRole; label: string }[] = [
  { value: 'student', label: 'All students' },
  { value: 'instructor', label: 'All instructors' },
  { value: 'admin', label: 'All admins' },
];

export default function AdminNotificationComposeForm({ courses }: ComposeFormProps) {
  const [form, setForm] = useState<ComposeFormState>({
    title: '',
    body: '',
    category: 'general',
    targetType: 'all',
    role: 'student',
    userId: '',
    courseId: courses[0]?.id ?? '',
    requiresAcknowledge: false,
    linkUrl: '',
  });
  const [pickedUser, setPickedUser] = useState<UserPick | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<UserPick[]>([]);
  const [userSearchState, setUserSearchState] = useState<'idle' | 'searching' | 'no-access' | 'done'>('idle');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced user search against the existing admin users endpoint.
  useEffect(() => {
    if (form.targetType !== 'user' || pickedUser) return;
    const q = userQuery.trim();
    if (q.length < 2) {
      setUserResults([]);
      setUserSearchState('idle');
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setUserSearchState('searching');
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(q)}&limit=10`);
        if (res.status === 403) {
          setUserSearchState('no-access');
          setUserResults([]);
          return;
        }
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        const users: UserPick[] = (Array.isArray(data.users) ? data.users : []).map((u: { id: string; name: string; email: string }) => ({
          id: u.id,
          name: u.name,
          email: u.email,
        }));
        setUserResults(users);
        setUserSearchState('done');
      } catch {
        setUserResults([]);
        setUserSearchState('done');
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [userQuery, form.targetType, pickedUser]);

  const setCategory = (category: NotificationCategory) => {
    // Default the acknowledgement checkbox per category (ON for
    // Important / Special Notice, OFF otherwise). Changing the
    // category re-applies the default; the admin can still toggle it.
    setForm((f) => ({ ...f, category, requiresAcknowledge: defaultRequiresAcknowledge(category) }));
  };

  const resetForm = () => {
    setForm({
      title: '',
      body: '',
      category: 'general',
      targetType: 'all',
      role: 'student',
      userId: '',
      courseId: courses[0]?.id ?? '',
      requiresAcknowledge: false,
      linkUrl: '',
    });
    setPickedUser(null);
    setUserQuery('');
    setUserResults([]);
  };

  const handleSubmit = async () => {
    const payload = buildComposePayload(form);
    if (!payload.ok) {
      toast.error(payload.error);
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not send the notification');
        return;
      }
      const created = typeof data.created === 'number' ? data.created : 0;
      const skipped = typeof data.skipped === 'number' ? data.skipped : 0;
      setResult({ created, skipped });
      toast.success(`Notification sent to ${created} user${created !== 1 ? 's' : ''}`);
      resetForm();
    } catch {
      toast.error('Could not send the notification — please try again');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {result && (
        <Card className="p-4 border-primary/40">
          <p className="flex items-center gap-2 text-white font-semibold text-sm">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            Notification sent
          </p>
          <p className="text-muted text-sm mt-1">
            Delivered to {result.created} user{result.created !== 1 ? 's' : ''}
            {result.skipped > 0 ? `, skipped ${result.skipped} (notification preferences off)` : ''}.
          </p>
        </Card>
      )}

      <Card className="p-5 sm:p-6 space-y-4">
        <Input
          label="Title"
          placeholder="Notification title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <Textarea
          label="Message"
          placeholder="Write the notification message…"
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          rows={5}
        />
        <Select
          label="Category"
          value={form.category}
          onChange={(e) => setCategory(e.target.value as NotificationCategory)}
          options={COMPOSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
        />

        <Select
          label="Send to"
          value={form.targetType}
          onChange={(e) =>
            setForm((f) => ({ ...f, targetType: e.target.value as ComposeTargetType, userId: '', }))
          }
          options={TARGET_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
        />

        {form.targetType === 'role' && (
          <Select
            label="Role"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as ComposeRole }))}
            options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
          />
        )}

        {form.targetType === 'user' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/80">User (search by name)</label>
            {pickedUser ? (
              <div className="flex items-center justify-between bg-dark-card border border-dark-border rounded-lg px-4 py-2.5">
                <span className="text-sm text-white">
                  {pickedUser.name} <span className="text-muted">({pickedUser.email})</span>
                </span>
                <button
                  type="button"
                  aria-label="Clear selected user"
                  className="text-muted hover:text-white cursor-pointer"
                  onClick={() => {
                    setPickedUser(null);
                    setForm((f) => ({ ...f, userId: '' }));
                    setUserQuery('');
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Type at least 2 letters of the student's name…"
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    className="w-full bg-dark-card border border-dark-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                </div>
                {userSearchState === 'searching' && <p className="text-muted text-xs">Searching…</p>}
                {userSearchState === 'no-access' && (
                  <p className="text-xs text-amber-400">
                    User search is not available for your admin account (students area not granted). Ask a
                    full admin to send this notification.
                  </p>
                )}
                {userSearchState === 'done' && userResults.length === 0 && userQuery.trim().length >= 2 && (
                  <p className="text-muted text-xs">
                    No matching student found. The search covers registered students only.
                  </p>
                )}
                {userResults.length > 0 && (
                  <ul className="bg-dark-card border border-dark-border rounded-lg divide-y divide-dark-border overflow-hidden">
                    {userResults.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="w-full text-left px-4 py-2.5 hover:bg-dark-border transition-colors cursor-pointer"
                          onClick={() => {
                            setPickedUser(u);
                            setForm((f) => ({ ...f, userId: u.id }));
                            setUserResults([]);
                          }}
                        >
                          <span className="text-sm text-white">{u.name}</span>
                          <span className="text-xs text-muted block">{u.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        {form.targetType === 'course' && (
          <Select
            label="Course"
            value={form.courseId}
            onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
            options={courses.map((c) => ({ value: c.id, label: c.title }))}
          />
        )}

        <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
          <input
            type="checkbox"
            checked={form.requiresAcknowledge}
            onChange={(e) => setForm((f) => ({ ...f, requiresAcknowledge: e.target.checked }))}
            className="accent-yellow-500"
          />
          Requires acknowledgement
          <span className="text-muted text-xs">(the user must acknowledge it before it goes away)</span>
        </label>

        <Input
          label="Link URL (optional)"
          placeholder="https://…"
          value={form.linkUrl}
          onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
        />

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={resetForm} disabled={sending}>
            Clear
          </Button>
          <Button fullWidth loading={sending} onClick={handleSubmit}>
            Send Notification
          </Button>
        </div>
      </Card>
    </div>
  );
}
