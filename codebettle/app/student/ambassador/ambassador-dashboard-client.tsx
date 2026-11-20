'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  UserPlus,
  BookOpen,
  BadgeCheck,
  Copy,
  Check,
  Users,
  Video,
  ExternalLink,
  Link2,
  Send,
  MessageSquare,
  Coins,
  Gift,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import StatCard from '@/components/ui/StatCard';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import type {
  Ambassador,
  AmbassadorMessage,
  AmbassadorRedemption,
  ReferralStats,
  ReferralTeamMember,
  TeamGoody,
} from '@/lib/db/types';
import { TEAM_GOODIES, TEAM_GOODY_LABELS } from '@/lib/db/types';

interface AmbassadorDashboardClientProps {
  ambassador: Ambassador;
  stats: ReferralStats;
  /** Credits available to spend (balance = SUM(ledger) — holds
   * already deducted). Pending requests hold credits separately
   * (see `redemptions`). */
  creditBalance: number;
  /** The goody prices from the live admin setting (Credits
   * Management) — the app never hard-codes a credit number. */
  goodyPrices: Record<TeamGoody, number>;
  /** The ambassador's redemption requests, newest first. */
  redemptions: AmbassadorRedemption[];
  /** False until Eman runs the redemption SQL — the redeem card
   * then shows a "not set up yet" note instead of the goodies. */
  redemptionReady: boolean;
  teamLevel1: ReferralTeamMember[];
  teamLevel2: ReferralTeamMember[];
  meetingLink: string;
  messages: AmbassadorMessage[];
  /** Dashboard switcher (Eman, 16 Nov 2026): the Instructor Portal
   * link shows only when the session holds teacher capability. */
  showInstructorPortal: boolean;
}

const REDEMPTION_BADGE: Record<AmbassadorRedemption['status'], 'info' | 'success' | 'muted'> = {
  pending: 'info',
  approved: 'success',
  rejected: 'muted',
};

const STAGE_BADGE: Record<ReferralTeamMember['stage'], 'info' | 'success' | 'muted'> = {
  'signed up': 'info',
  enrolled: 'success',
  paid: 'success',
};

function TeamList({ members, emptyText }: { members: ReferralTeamMember[]; emptyText: string }) {
  if (members.length === 0) {
    return <p className="text-muted text-sm text-center py-6">{emptyText}</p>;
  }
  return (
    <div className="space-y-2">
      {members.map((member) => (
        <div key={member.id} className="flex items-center gap-3 py-2 border-b border-dark-border last:border-0">
          <div className="w-9 h-9 rounded-lg bg-dark-border flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4 text-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-foreground font-medium text-sm truncate">{member.name}</p>
            <p className="text-muted text-xs truncate">
              {member.email} · Joined {formatDateShort(member.joinedAt)}
              {member.viaName ? ` · via ${member.viaName}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-muted text-xs hidden sm:inline">
              {member.enrollments} {member.enrollments === 1 ? 'course' : 'courses'}
            </span>
            <Badge variant={STAGE_BADGE[member.stage]}>{member.stage}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AmbassadorDashboardClient({
  ambassador,
  stats,
  creditBalance,
  goodyPrices,
  redemptions,
  redemptionReady,
  teamLevel1,
  teamLevel2,
  meetingLink,
  messages: initialMessages,
  showInstructorPortal,
}: AmbassadorDashboardClientProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [requesting, setRequesting] = useState<TeamGoody | null>(null);

  // Credits held in pending redemption requests (the hold is already
  // deducted from creditBalance — this is just the display split).
  const heldCredits = redemptions
    .filter((r) => r.status === 'pending')
    .reduce((sum, r) => sum + r.creditsSpent, 0);

  const requestGoody = async (goody: TeamGoody) => {
    setRequesting(goody);
    try {
      const res = await fetch('/api/student/ambassador/redemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goody }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error((data as { error?: string } | null)?.error ?? 'Could not request this goody');
        return;
      }
      toast.success('Request sent — an admin will review it');
      router.refresh();
    } catch {
      toast.error('Could not request this goody');
    } finally {
      setRequesting(null);
    }
  };

  // Group link + daily member count (Eman, 16 Nov 2026): the
  // ambassador types their own campus-group link and the member
  // count, and updates the count DAILY by hand — there is no
  // WhatsApp API to fetch it automatically.
  const [groupLink, setGroupLink] = useState(ambassador.groupLink ?? '');
  const [memberCount, setMemberCount] = useState(
    ambassador.groupMemberCount === undefined ? '' : String(ambassador.groupMemberCount),
  );
  const [savingGroup, setSavingGroup] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(ambassador.groupCountUpdatedAt ?? '');

  // Message to the admin (one-way, no reply thread in v1).
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messages, setMessages] = useState(initialMessages);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(ambassador.referralCode);
    } catch {
      // Clipboard API unavailable (older browsers / insecure
      // context): fall back to selecting the code text.
      const input = document.getElementById('referral-code-input') as HTMLInputElement | null;
      input?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Referral code copied');
  };

  const saveGroup = async () => {
    const count = memberCount.trim() === '' ? undefined : Number(memberCount);
    if (count !== undefined && (!Number.isInteger(count) || count < 0)) {
      toast.error('Member count must be a whole number, 0 or more');
      return;
    }
    setSavingGroup(true);
    try {
      const res = await fetch('/api/student/ambassador', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupLink: groupLink.trim(), groupMemberCount: count }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? 'Could not save your group details');
        return;
      }
      if (data.ambassador?.groupCountUpdatedAt) setLastUpdated(data.ambassador.groupCountUpdatedAt);
      toast.success('Group details saved');
    } catch {
      toast.error('Could not save your group details');
    } finally {
      setSavingGroup(false);
    }
  };

  const sendMessage = async () => {
    const text = messageText.trim();
    if (!text) {
      toast.error('Write a message first');
      return;
    }
    setSendingMessage(true);
    try {
      const res = await fetch('/api/student/ambassador/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? 'Could not send your message');
        return;
      }
      if (data.message) setMessages((m) => [data.message, ...m]);
      setMessageText('');
      toast.success('Message sent to the admin');
    } catch {
      toast.error('Could not send your message');
    } finally {
      setSendingMessage(false);
    }
  };

  const statCards: { label: string; value: number; icon: React.ReactNode; color: 'blue' | 'green' | 'yellow' }[] = [
    { label: 'Signups', value: stats.signups, icon: <UserPlus className="w-5 h-5" />, color: 'green' },
    { label: 'Enrollments', value: stats.enrollments, icon: <BookOpen className="w-5 h-5" />, color: 'yellow' },
    { label: 'Payments', value: stats.payments, icon: <BadgeCheck className="w-5 h-5" />, color: 'yellow' },
  ];

  return (
    <div className="space-y-8">
      {/* Dashboard switcher (Eman, 16 Nov 2026): a student+ambassador
          or teacher+ambassador switches between the portals they
          have. Student Portal is always shown; Instructor Portal only
          when the session holds teacher capability. The Ambassador
          Dashboard itself is the current segment. */}
      <nav aria-label="Switch dashboard" className="flex flex-wrap items-center gap-2">
        <span className="text-muted text-sm mr-1">Switch dashboard:</span>
        <Link
          href="/student/dashboard"
          className="rounded-full border border-dark-border bg-dark-card px-4 py-1.5 text-sm font-medium text-foreground hover:border-primary/50 transition-colors"
        >
          Student Portal
        </Link>
        {showInstructorPortal && (
          <Link
            href="/instructor/dashboard"
            className="rounded-full border border-dark-border bg-dark-card px-4 py-1.5 text-sm font-medium text-foreground hover:border-primary/50 transition-colors"
          >
            Instructor Portal
          </Link>
        )}
        <span
          aria-current="page"
          className="rounded-full border border-primary/60 bg-primary px-4 py-1.5 text-sm font-semibold text-ink"
        >
          Ambassador Dashboard
        </span>
      </nav>

      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">Ambassador Dashboard</h1>
        <p className="text-muted text-sm mt-1">
          Share your referral code — everyone who types it when they register joins your team.
        </p>
      </FadeIn>

      {/* Referral code — the ONLY way a student joins your team
          (Eman, 20 Nov 2026): there is no link tracking any more.
          New students type this code in the "Referral code" box on
          the register form; you earn 100 credits when they enrol,
          and they get Rs 200 off. */}
      <FadeIn>
        <Card glass>
          <p className="text-foreground font-semibold mb-1">Your referral code</p>
          <p className="text-muted text-sm mb-4">
            Your code is <span className="text-primary-text font-mono font-bold">{ambassador.referralCode}</span> —
            anyone who types it when they register counts as your referral.
          </p>
          <div className="flex gap-2">
            <Input
              id="referral-code-input"
              value={ambassador.referralCode}
              readOnly
              aria-label="Your referral code"
              className="flex-1 font-mono text-sm"
            />
            <Button onClick={copyCode} className="flex-shrink-0">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy code'}
            </Button>
          </div>
        </Card>
      </FadeIn>

      {/* 3-stage stats — the canonical StatCard (V32): count-up values,
          staggered entrance, glass surface. Same real stage numbers;
          the stagger comes from StatCard's own entrance delay, so no
          FadeIn wrapper is needed around each card (that would fade
          the card twice). */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat, i) => (
          <StatCard key={stat.label} title={stat.label} value={stat.value} icon={stat.icon} color={stat.color} delay={0.05 + i * 0.06} glass />
        ))}
      </div>

      {/* My Credits (Eman, 20 Nov 2026): 100 credits for every
          referred student on their FIRST enrollment — never for
          signups alone, never per enrollment. Redemption landed
          21 Nov 2026 (Eman): credits redeem for goodies below, at
          the admin's prices. */}
      <FadeIn>
        <Card glass>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary-text flex items-center justify-center flex-shrink-0">
              <Coins className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-foreground">My Credits</h2>
              <p className="text-muted text-sm mt-1">
                You earn <span className="text-foreground font-semibold">100 credits</span> for every student who
                enrols with your code — and they get Rs 200 off their course.
              </p>
              <p className="mt-3">
                <span className="text-3xl font-bold text-foreground">{creditBalance}</span>
                <span className="text-muted text-sm ml-2">credits available</span>
              </p>
              {heldCredits > 0 ? (
                <p className="text-muted text-xs mt-2">{heldCredits} credits held in pending redemption requests.</p>
              ) : null}
            </div>
          </div>
        </Card>
      </FadeIn>

      {/* Redeem for goodies (Eman, 21 Nov 2026): the SAME goodies +
          prices as the team system, set by the admin in Credits
          Management. A request holds the credits while it is pending. */}
      <FadeIn>
        <Card glass>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary-text" /> Redeem for goodies
          </h2>
          <p className="text-muted text-sm mt-1">
            Request a goody and an admin approves it — the credits are held while your request is pending, so they
            cannot be spent twice.
          </p>
          {!redemptionReady ? (
            <p className="text-sm text-muted mt-4">
              Goodies are not set up yet — the admin still has to run the redemption setup. Your credits are safe
              and keep earning meanwhile.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              {TEAM_GOODIES.map((goody) => {
                const price = goodyPrices[goody];
                const priced = Number.isInteger(price) && price > 0;
                const affordable = priced && creditBalance >= price;
                return (
                  <div key={goody} className="border border-dark-border rounded-xl p-4 flex flex-col">
                    <p className="font-bold text-foreground">{TEAM_GOODY_LABELS[goody]}</p>
                    <p className="text-2xl font-black text-primary-text mt-2">
                      {priced ? price : '—'} <span className="text-sm font-medium text-muted">credits</span>
                    </p>
                    <Button
                      onClick={() => requestGoody(goody)}
                      disabled={!affordable || requesting !== null}
                      className="mt-4 w-full"
                    >
                      {requesting === goody ? 'Requesting…' : !priced ? 'Not priced yet' : affordable ? 'Request' : 'Not enough credits'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </FadeIn>

      {/* My redemptions */}
      {redemptionReady && redemptions.length > 0 ? (
        <FadeIn>
          <Card glass>
            <h2 className="text-lg font-bold text-foreground">My redemptions</h2>
            <ul className="space-y-3 mt-4">
              {redemptions.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 border-b border-dark-border pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{TEAM_GOODY_LABELS[r.goody]}</p>
                    <p className="text-xs text-muted">Requested {formatDateShort(r.requestedAt)}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-bold text-foreground">{r.creditsSpent} credits</span>
                    <Badge variant={REDEMPTION_BADGE[r.status]}>{r.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </FadeIn>
      ) : null}

      {/* Ambassador meeting link (same style as the course live-class
          card). Shown only when the admin has set a link. */}
      {meetingLink ? (
        <FadeIn>
          <div className="bg-gradient-to-r from-blue-500/15 to-transparent border border-blue-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Video className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="text-foreground font-bold text-sm">Ambassador Meeting</p>
              <p className="text-muted text-xs mt-0.5">Join the ambassador meeting — the link is set by the admin.</p>
            </div>
            <a href={meetingLink} target="_blank" rel="noopener noreferrer">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white border-0 flex-shrink-0">
                <ExternalLink className="w-4 h-4" /> Join Meeting
              </Button>
            </a>
          </div>
        </FadeIn>
      ) : null}

      {/* My Team */}
      <FadeIn>
        <Card glass>
          <h2 className="text-lg font-bold text-foreground mb-1">My Team</h2>
          <p className="text-muted text-sm mb-4">
            People who joined with your code (level 1), and people who joined with their codes (level 2).
          </p>
          <h3 className="text-foreground font-semibold text-sm mb-2">Level 1 — direct referrals ({teamLevel1.length})</h3>
          <TeamList members={teamLevel1} emptyText="No one has joined with your code yet — share it with your campus." />
          <h3 className="text-foreground font-semibold text-sm mt-6 mb-2">Level 2 — referrals of your referrals ({teamLevel2.length})</h3>
          <TeamList members={teamLevel2} emptyText="No level-2 referrals yet — when your team members bring people in, they show up here." />
        </Card>
      </FadeIn>

      {/* Campus group link + daily member count */}
      <FadeIn>
        <Card glass>
          <h2 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary-text" /> My Campus Group
          </h2>
          <p className="text-muted text-sm mb-4">
            Your WhatsApp / campus group link, and how many members it has — update the count every day by hand.
          </p>
          <div className="space-y-3">
            <div>
              <label htmlFor="group-link" className="text-foreground text-sm font-medium block mb-1">Group link</label>
              <Input
                id="group-link"
                type="url"
                value={groupLink}
                onChange={(e) => setGroupLink(e.target.value)}
                placeholder="https://chat.whatsapp.com/…"
              />
            </div>
            <div>
              <label htmlFor="group-count" className="text-foreground text-sm font-medium block mb-1">Members in the group</label>
              <Input
                id="group-count"
                type="number"
                min={0}
                step={1}
                value={memberCount}
                onChange={(e) => setMemberCount(e.target.value)}
                placeholder="0"
              />
              {lastUpdated ? (
                <p className="text-muted text-xs mt-1">Last updated {formatDateShort(lastUpdated)}</p>
              ) : null}
            </div>
            <Button onClick={saveGroup} loading={savingGroup}>Save group details</Button>
          </div>
        </Card>
      </FadeIn>

      {/* Message to the admin */}
      <FadeIn>
        <Card glass>
          <h2 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary-text" /> Message the Admin
          </h2>
          <p className="text-muted text-sm mb-4">
            Facing an issue? Send a message to the admin — they will see it on the Ambassadors page.
          </p>
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Write your message here…"
            rows={3}
            maxLength={2000}
            className="w-full bg-dark border border-dark-border rounded-lg px-3 py-2 text-foreground text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="mt-3">
            <Button onClick={sendMessage} loading={sendingMessage}>
              <Send className="w-4 h-4" /> Send message
            </Button>
          </div>
          {messages.length > 0 ? (
            <div className="mt-6 pt-4 border-t border-dark-border">
              <h3 className="text-foreground font-semibold text-sm mb-2">Your messages</h3>
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className="py-2 border-b border-dark-border last:border-0">
                    <p className="text-foreground text-sm whitespace-pre-line">{m.message}</p>
                    <p className="text-muted text-xs mt-1">{formatDateShort(m.createdAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      </FadeIn>

      <p className="text-muted text-xs">
        More ambassador tools are coming — this dashboard will grow with the programme.{' '}
        <Link href="/become-ambassador" className="text-primary-text hover:underline">About the programme</Link>
      </p>
    </div>
  );
}
