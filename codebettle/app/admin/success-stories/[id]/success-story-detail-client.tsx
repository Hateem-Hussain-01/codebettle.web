'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import {
  SUCCESS_STORY_STATUSES,
  SUCCESS_STORY_STATUS_LABELS,
  successStoryCategoryLabel,
  type SuccessStoryStatus,
} from '@/lib/success-story-categories';
import { youtubeVideoId } from '@/lib/success-story-validation';
import type { SuccessStorySubmission } from '@/lib/db/types';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileText,
  Link2,
  Pencil,
  Play,
  Star,
  Trash2,
  XCircle,
} from 'lucide-react';

const STATUS_BADGE: Record<SuccessStoryStatus, string> = {
  pending: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  under_review: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  approved: 'bg-green-500/10 text-green-300 border-green-500/30',
  rejected: 'bg-red-500/10 text-red-300 border-red-500/30',
};

interface DetailResponse {
  submission: SuccessStorySubmission;
  media: { profilePictureUrl?: string; videoPlaybackUrl?: string };
  error?: string;
}

export default function SuccessStoryDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [submission, setSubmission] = useState<SuccessStorySubmission | null>(null);
  const [media, setMedia] = useState<{ profilePictureUrl?: string; videoPlaybackUrl?: string }>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<SuccessStoryStatus>('under_review');
  const [featured, setFeatured] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [openingFile, setOpeningFile] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/success-stories/${id}`);
      const json = (await res.json()) as DetailResponse;
      if (!res.ok) throw new Error(json.error ?? 'Could not load the submission');
      setSubmission(json.submission);
      setMedia(json.media ?? {});
      setReviewStatus(json.submission.status);
      setFeatured(json.submission.featured);
      setAdminNote(json.submission.adminNote ?? '');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load the submission');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchReview(statusOverride?: SuccessStoryStatus) {
    if (!submission) return;
    const status = statusOverride ?? reviewStatus;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/success-stories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, featured, adminNote: adminNote || null }),
      });
      const json = (await res.json()) as { submission?: SuccessStorySubmission; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Could not save the review');
      if (json.submission) {
        setSubmission(json.submission);
        setReviewStatus(json.submission.status);
        setFeatured(json.submission.featured);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not save the review');
    } finally {
      setBusy(false);
    }
  }

  function startEditing() {
    if (!submission) return;
    setEditFields({
      fullName: submission.fullName,
      country: submission.country,
      city: submission.city ?? '',
      designation: submission.designation ?? '',
      courseTitle: submission.courseTitle,
      batchNumber: submission.batchNumber ? String(submission.batchNumber) : '',
      skillsLearned: submission.skillsLearned,
      experience: submission.experience,
      story: submission.story,
      beforeJoining: submission.beforeJoining ?? '',
      challenges: submission.challenges ?? '',
      howHelped: submission.howHelped ?? '',
      achievementsAfter: submission.achievementsAfter ?? '',
      biggestAchievement: submission.biggestAchievement ?? '',
      advice: submission.advice ?? '',
    });
    setEditing(true);
  }

  async function saveEdits() {
    setBusy(true);
    setActionError(null);
    try {
      const details: Record<string, unknown> = {
        fullName: editFields.fullName?.trim(),
        country: editFields.country?.trim(),
        city: editFields.city?.trim() || null,
        designation: editFields.designation?.trim() || null,
        courseTitle: editFields.courseTitle?.trim(),
        batchNumber: editFields.batchNumber?.trim() ? Number(editFields.batchNumber) : null,
        skillsLearned: editFields.skillsLearned?.trim(),
        experience: editFields.experience?.trim(),
        story: editFields.story?.trim(),
        beforeJoining: editFields.beforeJoining?.trim() || null,
        challenges: editFields.challenges?.trim() || null,
        howHelped: editFields.howHelped?.trim() || null,
        achievementsAfter: editFields.achievementsAfter?.trim() || null,
        biggestAchievement: editFields.biggestAchievement?.trim() || null,
        advice: editFields.advice?.trim() || null,
      };
      const res = await fetch(`/api/admin/success-stories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ details }),
      });
      const json = (await res.json()) as { submission?: SuccessStorySubmission; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Could not save the changes');
      if (json.submission) setSubmission(json.submission);
      setEditing(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not save the changes');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSubmission() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/success-stories/${id}`, { method: 'DELETE' });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Could not delete the submission');
      router.push('/admin/success-stories');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not delete the submission');
      setBusy(false);
    }
  }

  async function openEvidenceFile(evidenceId: string) {
    setOpeningFile(evidenceId);
    try {
      const res = await fetch(`/api/admin/success-stories/${id}/file?evidence=${evidenceId}`);
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? 'Could not open the file');
      window.open(json.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not open the file');
    } finally {
      setOpeningFile(null);
    }
  }

  if (loading) {
    return <div className="bg-dark-card border border-dark-border rounded-xl p-10 text-center text-muted">Loading submission…</div>;
  }

  if (loadError || !submission) {
    return (
      <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-6">
        <p className="text-sm font-bold text-red-400">{loadError ?? 'Submission not found'}</p>
        <Link href="/admin/success-stories" className="text-sm text-primary-text hover:underline mt-2 inline-block">
          ← Back to Success Stories
        </Link>
      </div>
    );
  }

  const videoId = submission.videoUrl ? youtubeVideoId(submission.videoUrl) : null;
  const socialLinks: { label: string; url: string }[] = [
    { label: 'LinkedIn', url: submission.linkedinUrl ?? '' },
    { label: 'GitHub', url: submission.githubUrl ?? '' },
    { label: 'Instagram', url: submission.instagramUrl ?? '' },
    { label: 'YouTube', url: submission.youtubeUrl ?? '' },
    { label: 'Portfolio', url: submission.portfolioUrl ?? '' },
    { label: 'LabLab.ai', url: submission.lablabUrl ?? '' },
    { label: 'LeetCode', url: submission.leetcodeUrl ?? '' },
    { label: 'HackerRank', url: submission.hackerrankUrl ?? '' },
    { label: 'Other', url: submission.otherProfileUrl ?? '' },
  ].filter((l) => l.url);

  return (
    <div className="space-y-6">
      <Link href="/admin/success-stories" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> All Submissions
      </Link>

      {actionError && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4">
          <p className="text-sm font-bold text-red-400">{actionError}</p>
        </div>
      )}

      {/* Header card */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <div className="flex flex-col sm:flex-row gap-5">
          {media.profilePictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.profilePictureUrl} alt={submission.fullName} className="w-24 h-24 rounded-full object-cover border-2 border-primary/40 shrink-0" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-primary/10 border-2 border-primary/40 flex items-center justify-center shrink-0">
              <span className="text-4xl font-black text-primary-text">{submission.fullName.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black text-foreground">{submission.fullName}</h1>
              {submission.featured && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary-text border border-primary/30">
                  <Star className="w-3 h-3 fill-yellow-400" /> Featured
                </span>
              )}
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_BADGE[submission.status]}`}>
                {SUCCESS_STORY_STATUS_LABELS[submission.status]}
              </span>
            </div>
            <p className="text-sm text-muted mt-1">
              {submission.submissionNumber} · Submitted{' '}
              {new Date(submission.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              {submission.reviewedAt && ` · Reviewed ${new Date(submission.reviewedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
            </p>
            <p className="text-sm text-muted mt-1">
              {submission.email} · {submission.courseTitle}
              {submission.batchNumber ? ` · Batch ${submission.batchNumber}` : ''}
              {submission.designation ? ` · ${submission.designation}` : ''}
            </p>
            <p className="text-sm text-muted mt-1">
              {submission.city ? `${submission.city}, ${submission.country}` : submission.country}
              {submission.joinedAt ? ` · Joined ${new Date(submission.joinedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ''}
              {submission.instructorName ? ` · Instructor: ${submission.instructorName}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Review actions */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-foreground mb-4">Review</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-1.5">Status</label>
            <select
              value={reviewStatus}
              onChange={(e) => setReviewStatus(e.target.value as SuccessStoryStatus)}
              className="w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
            >
              {SUCCESS_STORY_STATUSES.map((s) => (
                <option key={s} value={s} className="bg-dark-card">
                  {SUCCESS_STORY_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-3 bg-background border border-dark-border rounded-lg px-4 py-2.5 cursor-pointer self-end">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
              className="w-5 h-5 accent-yellow-400 cursor-pointer"
            />
            <span className="text-sm text-foreground">Featured story (special placement at the top of the public page)</span>
          </label>
        </div>
        <Textarea
          label="Admin Note (internal — never published)"
          rows={3}
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          placeholder="e.g. Verified the offer letter; story looks genuine."
        />
        <div className="flex flex-wrap gap-3 mt-4">
          <Button variant="primary" onClick={() => void patchReview()} loading={busy} disabled={busy}>
            <CheckCircle2 className="w-4 h-4" /> Save Review
          </Button>
          {submission.status !== 'approved' && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setReviewStatus('approved');
                void patchReview('approved');
              }}
            >
              Approve
            </Button>
          )}
          {submission.status !== 'rejected' && (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setReviewStatus('rejected');
                void patchReview('rejected');
              }}
            >
              <XCircle className="w-4 h-4" /> Reject
            </Button>
          )}
        </div>
        <p className="text-xs text-muted mt-3">
          Approving publishes the story on the public page immediately. Rejecting never blocks the
          student from submitting again.
        </p>
      </div>

      {/* Story details */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">Story Details</h2>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="w-4 h-4" /> Edit Details
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={() => void saveEdits()} loading={busy} disabled={busy}>
                Save Changes
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          )}
        </div>
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Full Name" value={editFields.fullName ?? ''} onChange={(e) => setEditFields((p) => ({ ...p, fullName: e.target.value }))} />
              <Input label="Country" value={editFields.country ?? ''} onChange={(e) => setEditFields((p) => ({ ...p, country: e.target.value }))} />
              <Input label="City" value={editFields.city ?? ''} onChange={(e) => setEditFields((p) => ({ ...p, city: e.target.value }))} />
              <Input label="Designation" value={editFields.designation ?? ''} onChange={(e) => setEditFields((p) => ({ ...p, designation: e.target.value }))} />
              <Input label="Course" value={editFields.courseTitle ?? ''} onChange={(e) => setEditFields((p) => ({ ...p, courseTitle: e.target.value }))} />
              <Input label="Batch Number" value={editFields.batchNumber ?? ''} onChange={(e) => setEditFields((p) => ({ ...p, batchNumber: e.target.value }))} />
            </div>
            <Textarea label="Skills Learned" rows={2} value={editFields.skillsLearned ?? ''} onChange={(e) => setEditFields((p) => ({ ...p, skillsLearned: e.target.value }))} />
            <Textarea label="Learning Experience" rows={3} value={editFields.experience ?? ''} onChange={(e) => setEditFields((p) => ({ ...p, experience: e.target.value }))} />
            <Textarea label="Success Story" rows={6} value={editFields.story ?? ''} onChange={(e) => setEditFields((p) => ({ ...p, story: e.target.value }))} />
            <Textarea label="Before Joining" rows={3} value={editFields.beforeJoining ?? ''} onChange={(e) => setEditFields((p) => ({ ...p, beforeJoining: e.target.value }))} />
            <Textarea label="Challenges" rows={3} value={editFields.challenges ?? ''} onChange={(e) => setEditFields((p) => ({ ...p, challenges: e.target.value }))} />
            <Textarea label="How CodeBettle Helped" rows={3} value={editFields.howHelped ?? ''} onChange={(e) => setEditFields((p) => ({ ...p, howHelped: e.target.value }))} />
            <Textarea label="Achievements After Joining" rows={3} value={editFields.achievementsAfter ?? ''} onChange={(e) => setEditFields((p) => ({ ...p, achievementsAfter: e.target.value }))} />
            <Textarea label="Biggest Achievement" rows={2} value={editFields.biggestAchievement ?? ''} onChange={(e) => setEditFields((p) => ({ ...p, biggestAchievement: e.target.value }))} />
            <Textarea label="Advice" rows={3} value={editFields.advice ?? ''} onChange={(e) => setEditFields((p) => ({ ...p, advice: e.target.value }))} />
          </div>
        ) : (
          <div className="space-y-5 text-sm">
            <DetailText label="Skills Learned" value={submission.skillsLearned} />
            <DetailText label="Learning Experience" value={submission.experience} />
            <DetailText label="Success Story" value={submission.story} />
            <DetailText label="Before Joining" value={submission.beforeJoining} />
            <DetailText label="Challenges" value={submission.challenges} />
            <DetailText label="How CodeBettle Helped" value={submission.howHelped} />
            <DetailText label="Achievements After Joining" value={submission.achievementsAfter} />
            <DetailText label="Biggest Achievement" value={submission.biggestAchievement} />
            <DetailText label="Advice" value={submission.advice} />
          </div>
        )}
      </div>

      {/* Achievements + evidence */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-foreground mb-4">Achievements & Evidence</h2>
        {submission.achievements.length === 0 ? (
          <p className="text-sm text-muted">No achievements added.</p>
        ) : (
          <div className="space-y-4">
            {submission.achievements.map((a) => (
              <div key={a.id} className="border border-dark-border rounded-xl p-4">
                <p className="font-bold text-foreground">
                  {a.title}{' '}
                  <span className="text-primary-text font-medium">({successStoryCategoryLabel(a.category)})</span>
                </p>
                <p className="text-sm text-muted mt-0.5">
                  {a.organization ?? ''}
                  {a.organization && a.achievedAt ? ' · ' : ''}
                  {a.achievedAt ? new Date(a.achievedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : ''}
                </p>
                {a.description && <p className="text-sm text-muted mt-2 whitespace-pre-wrap">{a.description}</p>}
                {a.evidence.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {a.evidence.map((ev) => (
                      <span key={ev.id} className="inline-flex items-center gap-1.5">
                        {ev.kind === 'file' ? (
                          <button
                            type="button"
                            disabled={openingFile === ev.id}
                            onClick={() => void openEvidenceFile(ev.id)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full bg-primary/10 text-primary-text border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-50"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            {openingFile === ev.id ? 'Opening…' : ev.label || ev.fileName || 'Evidence file'}
                          </button>
                        ) : (
                          <a
                            href={ev.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full bg-primary/10 text-primary-text border border-primary/20 hover:bg-primary/20 transition-colors"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            {ev.label || ev.url} <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Video + social */}
      {(videoId || media.videoPlaybackUrl || submission.videoUrl || socialLinks.length > 0) && (
        <div className="bg-dark-card border border-dark-border rounded-xl p-6">
          <h2 className="text-lg font-bold text-foreground mb-4">Video & Social Profiles</h2>
          {(videoId || media.videoPlaybackUrl) && (
            <div className="mb-5">
              <div className="rounded-xl overflow-hidden border border-dark-border aspect-video bg-black max-w-2xl">
                {videoId ? (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                    title="Video testimonial"
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video src={media.videoPlaybackUrl} controls className="w-full h-full" preload="metadata" />
                )}
              </div>
              {submission.videoDescription && <p className="text-sm text-muted mt-2">{submission.videoDescription}</p>}
              {submission.videoUrl && !videoId && (
                <a href={submission.videoUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-text hover:underline inline-flex items-center gap-1 mt-2">
                  <Play className="w-4 h-4" /> {submission.videoUrl}
                </a>
              )}
            </div>
          )}
          {socialLinks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {socialLinks.map((l) => (
                <a
                  key={l.label}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border border-dark-border text-foreground hover:border-primary/40 hover:text-primary-text transition-colors"
                >
                  {l.label} <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Consent */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-foreground mb-3">Consent Given</h2>
        <ul className="text-sm text-muted space-y-1.5">
          <li>Publication: {submission.consentPublication ? 'Yes' : 'No'}</li>
          <li>Media usage: {submission.consentMedia ? 'Yes' : 'No'}</li>
          <li>Information accuracy: {submission.consentAccuracy ? 'Yes' : 'No'}</li>
          <li>Contact for verification: {submission.consentContact ? 'Yes' : 'No'}</li>
        </ul>
      </div>

      {/* Delete */}
      <div className="bg-dark-card border border-red-500/30 rounded-xl p-6">
        <h2 className="text-lg font-bold text-foreground mb-2">Delete Submission</h2>
        <p className="text-sm text-muted mb-4">
          Permanently deletes the submission and its stored files (profile picture, video, evidence).
          Full admins only — the server enforces this.
        </p>
        {!deleteConfirm ? (
          <Button variant="danger" onClick={() => setDeleteConfirm(true)}>
            <Trash2 className="w-4 h-4" /> Delete Submission
          </Button>
        ) : (
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-sm font-bold text-red-400">Are you sure? This cannot be undone.</span>
            <Button variant="danger" onClick={() => void deleteSubmission()} loading={busy} disabled={busy}>
              Yes, Delete Permanently
            </Button>
            <Button variant="outline" onClick={() => setDeleteConfirm(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailText({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <h3 className="font-bold text-foreground mb-1">{label}</h3>
      <p className="text-muted leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}
