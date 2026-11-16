'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import Input from '@/components/ui/Input';
import { Trash2, Users, Link2, Video, MessageSquare, Copy, Check, Eye } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type {
  AmbassadorApplication,
  AmbassadorApplicationStatus,
  AmbassadorMessage,
  AmbassadorWithStats,
  ReferralTeamMember,
} from '@/lib/db/types';

interface AmbassadorsClientProps {
  initialApplications: AmbassadorApplication[];
  total: number;
  tableMissing: boolean;
  /** Referral tracking (Eman, 16 Nov 2026). Everything below lives
   * on THIS page — no new admin tab was added for it. */
  referralReady: boolean;
  initialAmbassadors: AmbassadorWithStats[];
  ambassadorNames: Record<string, string>;
  initialMessages: AmbassadorMessage[];
  unreadMessages: number;
  initialMeetingLink: string;
}

const STATUS_LABEL: Record<AmbassadorApplicationStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_BADGE: Record<AmbassadorApplicationStatus, 'info' | 'success' | 'danger'> = {
  pending: 'info',
  approved: 'success',
  rejected: 'danger',
};

const MEMBER_STAGE_BADGE: Record<ReferralTeamMember['stage'], 'info' | 'success' | 'muted'> = {
  'signed up': 'info',
  enrolled: 'success',
  paid: 'success',
};

function TeamMembers({ members, emptyText }: { members: ReferralTeamMember[]; emptyText: string }) {
  if (members.length === 0) return <p className="text-muted text-xs py-2">{emptyText}</p>;
  return (
    <div className="space-y-1.5">
      {members.map((m) => (
        <div key={m.id} className="flex items-center gap-2 text-sm">
          <span className="text-foreground font-medium">{m.name}</span>
          <span className="text-muted text-xs truncate">
            {m.email} · Joined {formatDateShort(m.joinedAt)} · {m.enrollments} {m.enrollments === 1 ? 'course' : 'courses'}
            {m.viaName ? ` · via ${m.viaName}` : ''}
          </span>
          <Badge variant={MEMBER_STAGE_BADGE[m.stage]}>{m.stage}</Badge>
        </div>
      ))}
    </div>
  );
}

export default function AmbassadorsClient({
  initialApplications,
  total,
  tableMissing,
  referralReady,
  initialAmbassadors,
  ambassadorNames,
  initialMessages,
  unreadMessages,
  initialMeetingLink,
}: AmbassadorsClientProps) {
  const [list, setList] = useState(initialApplications);
  const [filter, setFilter] = useState<'all' | AmbassadorApplicationStatus>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Referral tracking state.
  const [ambassadors, setAmbassadors] = useState(initialAmbassadors);
  const [expandedAmbassadorId, setExpandedAmbassadorId] = useState<string | null>(null);
  const [grantEmail, setGrantEmail] = useState('');
  const [granting, setGranting] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [meetingLink, setMeetingLink] = useState(initialMeetingLink);
  const [savingMeetingLink, setSavingMeetingLink] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  const [unread, setUnread] = useState(unreadMessages);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const shown = filter === 'all' ? list : list.filter((a) => a.status === filter);
  const pendingCount = list.filter((a) => a.status === 'pending').length;

  const changeStatus = async (application: AmbassadorApplication, status: AmbassadorApplicationStatus) => {
    const res = await fetch(`/api/admin/ambassadors/${application.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error('Could not update the application');
      return;
    }
    const data = await res.json();
    setList((l) => l.map((a) => (a.id === application.id ? data.application : a)));
    toast.success(`Application ${STATUS_LABEL[status].toLowerCase()}`);
    // Approving creates the ambassador + referral code (server-side);
    // refresh the ambassadors list so the new code shows here.
    if (status === 'approved') {
      window.location.reload();
    }
  };

  const handleDelete = async (application: AmbassadorApplication) => {
    if (!window.confirm(`Delete the ambassador application from ${application.fullName}?`)) return;
    const res = await fetch(`/api/admin/ambassadors/${application.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Could not delete the application');
      return;
    }
    setList((l) => l.filter((a) => a.id !== application.id));
    toast.success('Application deleted');
  };

  const grantAmbassador = async () => {
    const email = grantEmail.trim();
    if (!email) {
      toast.error('Enter an email address');
      return;
    }
    setGranting(true);
    try {
      const res = await fetch('/api/admin/ambassadors/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? 'Could not grant ambassador status');
        return;
      }
      const created = data.ambassador as AmbassadorWithStats | undefined;
      if (created) {
        setAmbassadors((a) =>
          a.some((x) => x.id === created.id)
            ? a
            : [{ ...created, stats: { clicks: 0, signups: 0, enrollments: 0, payments: 0 }, teamLevel1: [], teamLevel2: [] }, ...a],
        );
      }
      setGrantEmail('');
      toast.success(`Ambassador granted — code ${data.ambassador?.referralCode ?? ''}`);
    } catch {
      toast.error('Could not grant ambassador status');
    } finally {
      setGranting(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard unavailable — the code is still visible to copy by hand.
    }
    setCopiedCode(code);
    setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 2000);
    toast.success('Referral code copied');
  };

  const saveMeetingLink = async () => {
    setSavingMeetingLink(true);
    try {
      const res = await fetch('/api/admin/ambassadors/meeting-link', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingLink: meetingLink.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? 'Could not save the meeting link');
        return;
      }
      setMeetingLink(data.meetingLink ?? '');
      toast.success('Meeting link saved — ambassadors see it on their dashboard');
    } catch {
      toast.error('Could not save the meeting link');
    } finally {
      setSavingMeetingLink(false);
    }
  };

  const markMessageRead = async (message: AmbassadorMessage) => {
    const res = await fetch(`/api/admin/ambassadors/messages/${message.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true }),
    });
    if (!res.ok) {
      toast.error('Could not mark the message read');
      return;
    }
    setMessages((m) => m.map((x) => (x.id === message.id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
  };

  const ambassadorName = (ambassadorId: string) => ambassadorNames[ambassadorId] ?? 'Ambassador';

  /**
   * Admin-assisted view-as: open the ambassador's actual dashboard,
   * view-only. Same pattern as "Switch to Teacher Portal" on the
   * Instructors page. No time limit — the session lasts until the
   * admin clicks Exit in the banner, signs out, or closes the
   * browser. Only ambassadors linked to a student account can be
   * viewed (userId is null until they sign in with the granted
   * email); inactive ambassadors never get the button (the service
   * refuses them), so this only ever fires for active accounts.
   */
  const handleSwitchToAmbassadorDashboard = async (ambassadorUserId: string) => {
    setSwitchingId(ambassadorUserId);
    try {
      const res = await fetch('/api/admin/view-as/ambassador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ambassadorId: ambassadorUserId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not open the ambassador dashboard'); return; }
      window.location.href = '/student/ambassador';
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground">Ambassadors</h1>
          <p className="text-muted text-sm mt-1">
            Campus ambassador applications from /become-ambassador
            {pendingCount > 0 ? ` — ${pendingCount} pending` : ''} ({total} total)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
            <Button key={s} variant={filter === s ? 'primary' : 'outline'} size="sm" onClick={() => setFilter(s)}>
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </Button>
          ))}
        </div>
      </FadeIn>

      {tableMissing && (
        <Card className="border-primary/40">
          <p className="text-foreground font-medium">Ambassador applications are not set up yet</p>
          <p className="text-muted text-sm mt-1">
            Run <code className="text-primary-text">codebettle-footer-bookcall-migration.sql</code> in the Supabase SQL
            Editor first — until then applications cannot be saved and this list stays empty.
          </p>
        </Card>
      )}

      {shown.length === 0 ? (
        <Card className="py-16 text-center">
          <Users className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-foreground font-medium">No applications{filter !== 'all' ? ` — nothing ${filter}` : ' yet'}</p>
          <p className="text-muted text-sm mt-1">Applications from the /become-ambassador form will appear here.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((application, i) => {
            const expanded = expandedId === application.id;
            return (
              <FadeIn key={application.id} delay={Math.min(i, 4) * 0.05}>
                <Card className={application.status === 'pending' ? 'border-primary/30' : ''}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : application.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${application.status === 'pending' ? 'bg-primary/15 text-primary-text' : 'bg-dark-border text-muted'}`}
                      >
                        <Users className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-foreground font-medium text-sm">{application.fullName}</p>
                          <Badge variant={STATUS_BADGE[application.status]}>{STATUS_LABEL[application.status]}</Badge>
                          <span className="text-muted text-xs ml-auto">{formatDateShort(application.createdAt)}</span>
                        </div>
                        <p className="text-muted text-xs mt-0.5">
                          {application.email}
                          {application.whatsapp ? ` · WhatsApp ${application.whatsapp}` : ''}
                          {application.university ? ` · ${application.university}` : ''}
                          {application.departmentSemester ? ` · ${application.departmentSemester}` : ''}
                        </p>
                        <p className={`text-muted text-sm mt-2 ${expanded ? '' : 'line-clamp-2'}`}>{application.promotionPlan}</p>
                      </div>
                    </div>
                  </button>
                  {expanded && (
                    <div className="mt-4 pt-4 border-t border-dark-border space-y-2 text-sm">
                      <p className="text-muted">
                        <span className="text-foreground font-medium">WhatsApp: </span>
                        <a href={`tel:${application.whatsapp.replace(/\s+/g, '')}`} className="text-primary-text hover:underline">
                          {application.whatsapp}
                        </a>
                      </p>
                      <p className="text-muted">
                        <span className="text-foreground font-medium">Email: </span>
                        <a href={`mailto:${application.email}`} className="text-primary-text hover:underline">
                          {application.email}
                        </a>
                      </p>
                      <p className="text-muted">
                        <span className="text-foreground font-medium">University / Institute: </span>
                        {application.university}
                      </p>
                      <p className="text-muted">
                        <span className="text-foreground font-medium">Department &amp; Semester: </span>
                        {application.departmentSemester}
                      </p>
                      <p className="text-muted">
                        <span className="text-foreground font-medium">Leadership position: </span>
                        {application.leadershipPosition}
                      </p>
                      <p className="text-muted">
                        <span className="text-foreground font-medium">Ambassador work before: </span>
                        {application.priorAmbassadorExperience}
                      </p>
                      <div className="text-muted">
                        <span className="text-foreground font-medium">How they plan to promote CodeBettle: </span>
                        <span className="whitespace-pre-line">{application.promotionPlan}</span>
                      </div>
                      <div className="flex gap-2 flex-wrap pt-2">
                        {application.status !== 'approved' && (
                          <Button size="sm" onClick={() => changeStatus(application, 'approved')}>
                            Approve
                          </Button>
                        )}
                        {application.status !== 'rejected' && (
                          <Button size="sm" variant="outline" onClick={() => changeStatus(application, 'rejected')}>
                            Reject
                          </Button>
                        )}
                        {application.status !== 'pending' && (
                          <Button size="sm" variant="ghost" onClick={() => changeStatus(application, 'pending')}>
                            Back to pending
                          </Button>
                        )}
                        <Button size="sm" variant="danger" onClick={() => handleDelete(application)}>
                          <Trash2 className="w-4 h-4" /> Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </FadeIn>
            );
          })}
        </div>
      )}

      {/* ---------------------------------------------------------------
          Referral tracking (Eman, 16 Nov 2026) — sections of THIS
          page, not a new admin tab. Approving an application creates
          the ambassador + referral code; the list below shows every
          ambassador's code and 4-stage numbers, their team tree, and
          their group link + member count.
      --------------------------------------------------------------- */}
      <FadeIn>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-black text-foreground">Referral Tracking</h2>
            <p className="text-muted text-sm mt-1">
              Every ambassador&apos;s referral code and what their link brought in — clicks, signups, enrollments, payments.
            </p>
          </div>
        </div>
      </FadeIn>

      {!referralReady ? (
        <Card className="border-primary/40">
          <p className="text-foreground font-medium">Referral tracking is not set up yet</p>
          <p className="text-muted text-sm mt-1">
            Run <code className="text-primary-text">codebettle-ambassador-referral-migration.sql</code> in the Supabase SQL
            Editor first — until then no referral codes, stats, or messages can be shown.
          </p>
        </Card>
      ) : (
        <>
          {/* Direct grant — give a referral code to your own people
              without them going through the form. */}
          <Card>
            <h3 className="text-foreground font-semibold mb-1">Grant ambassador status directly</h3>
            <p className="text-muted text-sm mb-3">
              Give a referral code to one of your own people by email — no application needed. They get their dashboard
              as soon as they sign in with that email.
            </p>
            <div className="flex gap-2">
              <Input
                type="email"
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                placeholder="name@example.com"
                aria-label="Email to grant ambassador status"
                className="flex-1"
              />
              <Button onClick={grantAmbassador} loading={granting}>Grant ambassador</Button>
            </div>
          </Card>

          {ambassadors.length === 0 ? (
            <Card className="py-12 text-center">
              <Users className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-foreground font-medium">No ambassadors yet</p>
              <p className="text-muted text-sm mt-1">Approve an application above, or grant ambassador status directly.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {ambassadors.map((ambassador, i) => {
                const expanded = expandedAmbassadorId === ambassador.id;
                const name = ambassadorName(ambassador.id);
                return (
                  <FadeIn key={ambassador.id} delay={Math.min(i, 4) * 0.05}>
                    <Card>
                      <button
                        type="button"
                        onClick={() => setExpandedAmbassadorId(expanded ? null : ambassador.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary-text flex items-center justify-center flex-shrink-0">
                            <Users className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-foreground font-medium text-sm">{name}</p>
                              <Badge variant={ambassador.status === 'active' ? 'success' : 'muted'}>
                                {ambassador.status === 'active' ? 'Active' : 'Inactive'}
                              </Badge>
                              <span className="text-muted text-xs ml-auto">{formatDateShort(ambassador.createdAt)}</span>
                            </div>
                            <p className="text-muted text-xs mt-0.5">{ambassador.email}</p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <span className="text-muted text-xs">Code</span>
                              <code className="text-primary-text font-mono font-bold text-sm">{ambassador.referralCode}</code>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyCode(ambassador.referralCode);
                                }}
                                className="text-muted hover:text-primary-text"
                                aria-label={`Copy referral code ${ambassador.referralCode}`}
                              >
                                {copiedCode === ambassador.referralCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                            <div className="flex gap-4 mt-2 flex-wrap text-sm">
                              <span className="text-muted"><span className="text-foreground font-bold">{ambassador.stats.clicks}</span> clicks</span>
                              <span className="text-muted"><span className="text-foreground font-bold">{ambassador.stats.signups}</span> signups</span>
                              <span className="text-muted"><span className="text-foreground font-bold">{ambassador.stats.enrollments}</span> enrollments</span>
                              <span className="text-muted"><span className="text-foreground font-bold">{ambassador.stats.payments}</span> payments</span>
                            </div>
                            {ambassador.groupLink || ambassador.groupMemberCount !== undefined ? (
                              <p className="text-muted text-xs mt-2 flex items-center gap-1.5 flex-wrap">
                                <Link2 className="w-3.5 h-3.5 text-primary-text flex-shrink-0" />
                                {ambassador.groupLink ? (
                                  <a
                                    href={ambassador.groupLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary-text hover:underline truncate max-w-60"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {ambassador.groupLink}
                                  </a>
                                ) : (
                                  <span>No group link set</span>
                                )}
                                {ambassador.groupMemberCount !== undefined ? (
                                  <span>
                                    · {ambassador.groupMemberCount} members
                                    {ambassador.groupCountUpdatedAt ? ` · updated ${formatDateShort(ambassador.groupCountUpdatedAt)}` : ''}
                                  </span>
                                ) : null}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </button>
                      {/* View-as entry point: one Switch per ambassador
                          row — only when the ambassador is linked to a
                          student account (userId) and active. Placed
                          outside the expand <button> above (nested
                          buttons are invalid HTML). */}
                      {ambassador.userId && ambassador.status === 'active' && (
                        <div className="mt-3 pt-3 border-t border-dark-border">
                          <Button
                            size="sm"
                            variant="secondary"
                            fullWidth
                            onClick={() => handleSwitchToAmbassadorDashboard(ambassador.userId!)}
                            loading={switchingId === ambassador.userId}
                          >
                            <Eye className="w-3.5 h-3.5" /> Switch to Ambassador Dashboard
                          </Button>
                        </div>
                      )}
                      {expanded && (
                        <div className="mt-4 pt-4 border-t border-dark-border space-y-4 text-sm">
                          <div>
                            <p className="text-foreground font-medium mb-2">Level 1 — direct referrals ({ambassador.teamLevel1.length})</p>
                            <TeamMembers members={ambassador.teamLevel1} emptyText="No direct referrals yet." />
                          </div>
                          <div>
                            <p className="text-foreground font-medium mb-2">Level 2 — referrals of referrals ({ambassador.teamLevel2.length})</p>
                            <TeamMembers members={ambassador.teamLevel2} emptyText="No level-2 referrals yet." />
                          </div>
                        </div>
                      )}
                    </Card>
                  </FadeIn>
                );
              })}
            </div>
          )}

          {/* Ambassador meeting link — ONE link for every ambassador. */}
          <Card>
            <h3 className="text-foreground font-semibold mb-1 flex items-center gap-2">
              <Video className="w-5 h-5 text-primary-text" /> Ambassador meeting link
            </h3>
            <p className="text-muted text-sm mb-3">
              The recurring ambassador meeting link — it shows in every ambassador&apos;s dashboard. Change it here whenever it
              changes.
            </p>
            <div className="flex gap-2">
              <Input
                type="url"
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://meet.google.com/…"
                aria-label="Ambassador meeting link"
                className="flex-1"
              />
              <Button onClick={saveMeetingLink} loading={savingMeetingLink}>Save meeting link</Button>
            </div>
          </Card>

          {/* Messages from ambassadors (one-way, no reply thread). */}
          <Card>
            <h3 className="text-foreground font-semibold mb-1 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary-text" /> Messages from ambassadors
              {unread > 0 ? <Badge variant="info">{unread} unread</Badge> : null}
            </h3>
            <p className="text-muted text-sm mb-4">
              Issues ambassadors send from their dashboard — one-way messages, no reply thread in this version.
            </p>
            {messages.length === 0 ? (
              <p className="text-muted text-sm text-center py-6">No messages yet.</p>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div key={message.id} className="py-2 border-b border-dark-border last:border-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-foreground font-medium text-sm">{ambassadorName(message.ambassadorId)}</p>
                      <Badge variant={message.read ? 'muted' : 'info'}>{message.read ? 'Read' : 'Unread'}</Badge>
                      <span className="text-muted text-xs ml-auto">{formatDateShort(message.createdAt)}</span>
                    </div>
                    <p className="text-muted text-sm mt-1 whitespace-pre-line">{message.message}</p>
                    {!message.read ? (
                      <div className="mt-2">
                        <Button size="sm" variant="outline" onClick={() => markMessageRead(message)}>
                          Mark as read
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
