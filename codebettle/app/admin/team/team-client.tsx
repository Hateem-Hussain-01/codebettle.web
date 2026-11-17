'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Eye } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatDateShort, formatDateTime } from '@/lib/utils';
import type { TeamAccess, TeamAnnouncement, TeamFile, TeamMeeting, TeamTask } from '@/lib/db/types';

interface TeamAdminClientProps {
  grants: TeamAccess[];
  memberNames: Record<string, string>;
  tasks: TeamTask[];
  announcements: TeamAnnouncement[];
  meetings: TeamMeeting[];
  files: TeamFile[];
}

async function postJson(url: string, body: unknown, method = 'POST'): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

/**
 * Admin Team page (client): grant/revoke team access by email, create
 * + edit + reassign tasks, post announcements, schedule meetings,
 * upload + delete shared files. Every action calls the admin `team`
 * API routes; the server re-checks the area guard on each call.
 */
export default function TeamAdminClient({ grants, memberNames, tasks, announcements, meetings, files }: TeamAdminClientProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const [grantEmail, setGrantEmail] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [meetTitle, setMeetTitle] = useState('');
  const [meetStartsAt, setMeetStartsAt] = useState('');
  const [meetLink, setMeetLink] = useState('');
  const [meetAgenda, setMeetAgenda] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    router.refresh();
  }

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    setBusy('grant');
    try {
      const { ok, data } = await postJson('/api/admin/team/access', { email: grantEmail });
      if (!ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Could not grant team access');
        return;
      }
      toast.success('Team access granted');
      setGrantEmail('');
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function revoke(email: string) {
    setBusy(`revoke:${email}`);
    try {
      const res = await fetch(`/api/admin/team/access?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Could not revoke team access');
        return;
      }
      toast.success('Team access revoked');
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  /**
   * Admin-assisted view-as: open the member's actual team portal,
   * view-only. Same pattern as "Switch to Ambassador Dashboard" on
   * the Ambassadors page. No time limit — the session lasts until the
   * admin clicks Exit in the banner, signs out, or closes the
   * browser. Only members linked to an account can be viewed
   * (userId is null until they sign in with the granted email);
   * revoked grants never get the button (the service refuses them),
   * so this only ever fires for active accounts.
   */
  async function handleSwitchToTeamPortal(teamMemberUserId: string) {
    setSwitchingId(teamMemberUserId);
    try {
      const res = await fetch('/api/admin/view-as/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamMemberId: teamMemberUserId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Could not open the team portal');
        return;
      }
      window.location.href = '/team/dashboard';
    } finally {
      setSwitchingId(null);
    }
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setBusy('task');
    try {
      const { ok, data } = await postJson('/api/admin/team/tasks', {
        title: taskTitle,
        assigneeEmail: taskAssignee,
        description: taskDescription || undefined,
        dueDate: taskDueDate || undefined,
      });
      if (!ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Could not create the task');
        return;
      }
      toast.success('Task created');
      setTaskTitle('');
      setTaskAssignee('');
      setTaskDescription('');
      setTaskDueDate('');
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function setTaskStatus(task: TeamTask, status: TeamTask['status']) {
    setBusy(`task:${task.id}`);
    try {
      const { ok, data } = await postJson('/api/admin/team/tasks', { id: task.id, status }, 'PATCH');
      if (!ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Could not update the task');
        return;
      }
      toast.success('Task updated');
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function postAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    setBusy('ann');
    try {
      const { ok, data } = await postJson('/api/admin/team/announcements', { title: annTitle, body: annBody });
      if (!ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Could not post the announcement');
        return;
      }
      toast.success('Announcement posted');
      setAnnTitle('');
      setAnnBody('');
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function scheduleMeeting(e: React.FormEvent) {
    e.preventDefault();
    setBusy('meet');
    try {
      const { ok, data } = await postJson('/api/admin/team/meetings', {
        title: meetTitle,
        startsAt: meetStartsAt,
        meetingLink: meetLink || undefined,
        agenda: meetAgenda || undefined,
      });
      if (!ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Could not schedule the meeting');
        return;
      }
      toast.success('Meeting scheduled');
      setMeetTitle('');
      setMeetStartsAt('');
      setMeetLink('');
      setMeetAgenda('');
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function uploadFile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error('Choose a file first');
      return;
    }
    setBusy('file');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/admin/team/files', { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Upload failed');
        return;
      }
      toast.success('File uploaded');
      e.currentTarget.reset();
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function deleteFile(file: TeamFile) {
    setBusy(`file:${file.id}`);
    try {
      const res = await fetch(`/api/admin/team/files/${file.id}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Could not delete the file');
        return;
      }
      toast.success('File deleted');
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Access grants */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground">Team access</h2>
        <p className="text-sm text-muted mt-1">
          Grant access by email. The member signs in with their own email + password; a grant made before they register
          links to their account automatically. Revoking takes effect immediately — the row stays for audit.
        </p>
        <form onSubmit={grant} className="mt-4 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input label="Member email" type="email" placeholder="member@example.com" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} required />
          </div>
          <div className="flex items-end">
            <Button type="submit" loading={busy === 'grant'}>
              Grant access
            </Button>
          </div>
        </form>
        {grants.length === 0 ? (
          <p className="text-sm text-muted mt-4">No team members yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {grants.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 border border-dark-border rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {memberNames[g.email] ? `${memberNames[g.email]} · ` : ''}
                    {g.email}
                  </p>
                  <p className="text-xs text-muted">
                    {g.userId ? 'Account linked' : 'No account yet — links on their first sign-in'} · granted{' '}
                    {formatDateShort(g.grantedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={g.status === 'active' ? 'success' : 'muted'}>{g.status === 'active' ? 'Active' : 'Revoked'}</Badge>
                  {/* View-as entry point: one Switch per granted team
                      member row — only when the grant is linked to an
                      account (userId) and active. An unlinked grant
                      has no account to view, and a revoked grant is
                      refused by the service, so a button there would
                      only ever error. */}
                  {g.userId && g.status === 'active' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={switchingId === g.userId}
                      onClick={() => handleSwitchToTeamPortal(g.userId!)}
                    >
                      <Eye className="w-3.5 h-3.5" /> Switch to Team Portal
                    </Button>
                  )}
                  {g.status === 'active' && (
                    <Button size="sm" variant="danger" loading={busy === `revoke:${g.email}`} onClick={() => revoke(g.email)}>
                      Revoke
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Tasks */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground">Tasks</h2>
        <form onSubmit={createTask} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Title" placeholder="Task title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} required />
          <Input label="Assignee email" type="email" placeholder="member@example.com" value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} required />
          <Input label="Description (optional)" placeholder="What needs doing" value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} />
          <Input label="Due date (optional)" type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy === 'task'}>
              Create task
            </Button>
          </div>
        </form>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted mt-4">No tasks yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 border border-dark-border rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                  <p className="text-xs text-muted">
                    {t.assigneeEmail}
                    {t.dueDate ? ` · Due ${formatDateShort(t.dueDate)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={t.status === 'done' ? 'success' : t.status === 'doing' ? 'primary' : 'muted'}>
                    {t.status === 'todo' ? 'To do' : t.status === 'doing' ? 'Doing' : 'Done'}
                  </Badge>
                  {t.status !== 'done' && (
                    <Button size="sm" variant="outline" loading={busy === `task:${t.id}`} onClick={() => setTaskStatus(t, t.status === 'todo' ? 'doing' : 'done')}>
                      {t.status === 'todo' ? 'Start' : 'Mark done'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Announcements */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground">Announcements</h2>
        <form onSubmit={postAnnouncement} className="mt-4 space-y-3">
          <Input label="Title" placeholder="Announcement title" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} required />
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Body</label>
            <textarea
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              rows={3}
              required
              className="w-full rounded-lg border border-dark-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          <Button type="submit" loading={busy === 'ann'}>
            Post announcement
          </Button>
        </form>
        {announcements.length === 0 ? (
          <p className="text-sm text-muted mt-4">No announcements yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {announcements.map((a) => (
              <li key={a.id} className="border border-dark-border rounded-lg px-3 py-2">
                <p className="text-sm font-medium text-foreground">{a.title}</p>
                <p className="text-xs text-muted mt-0.5">{formatDateShort(a.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Meetings */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground">Meetings</h2>
        <form onSubmit={scheduleMeeting} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Title" placeholder="Meeting title" value={meetTitle} onChange={(e) => setMeetTitle(e.target.value)} required />
          <Input label="Start date & time" type="datetime-local" value={meetStartsAt} onChange={(e) => setMeetStartsAt(e.target.value)} required />
          <Input label="Meeting link (optional)" placeholder="https://meet.google.com/..." value={meetLink} onChange={(e) => setMeetLink(e.target.value)} />
          <Input label="Agenda (optional)" placeholder="What the meeting is about" value={meetAgenda} onChange={(e) => setMeetAgenda(e.target.value)} />
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy === 'meet'}>
              Schedule meeting
            </Button>
          </div>
        </form>
        {meetings.length === 0 ? (
          <p className="text-sm text-muted mt-4">No meetings scheduled.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {meetings.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 border border-dark-border rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                  <p className="text-xs text-muted">{formatDateTime(m.startsAt)}</p>
                </div>
                {m.meetingLink && (
                  <a href={m.meetingLink} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary-text hover:underline shrink-0">
                    Join link
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Files */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground">Files</h2>
        <p className="text-sm text-muted mt-1">Shared with the team (private bucket). Images, PDF, Office documents, text/CSV or ZIP — 10 MB max.</p>
        <form onSubmit={uploadFile} className="mt-4 flex flex-col sm:flex-row gap-3">
          <input
            ref={fileRef}
            type="file"
            aria-label="Choose a file to upload"
            className="flex-1 min-w-0 rounded-lg border border-dark-border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-ink"
          />
          <Button type="submit" loading={busy === 'file'}>
            Upload
          </Button>
        </form>
        {files.length === 0 ? (
          <p className="text-sm text-muted mt-4">No files shared yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 border border-dark-border rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{f.fileName}</p>
                  <p className="text-xs text-muted">
                    {Math.max(1, Math.round(f.size / 1024))} KB · {formatDateShort(f.createdAt)}
                  </p>
                </div>
                <Button size="sm" variant="danger" loading={busy === `file:${f.id}`} onClick={() => deleteFile(f)}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
