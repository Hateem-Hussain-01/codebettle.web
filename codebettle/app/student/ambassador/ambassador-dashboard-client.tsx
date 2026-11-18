'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  MousePointerClick,
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
} from 'lucide-react';
import Card from '@/components/ui/Card';
import StatCard from '@/components/ui/StatCard';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Ambassador, AmbassadorMessage, ReferralStats, ReferralTeamMember } from '@/lib/db/types';

interface AmbassadorDashboardClientProps {
  ambassador: Ambassador;
  referralLink: string;
  stats: ReferralStats;
  teamLevel1: ReferralTeamMember[];
  teamLevel2: ReferralTeamMember[];
  meetingLink: string;
  messages: AmbassadorMessage[];
  /** Dashboard switcher (Eman, 16 Nov 2026): the Instructor Portal
   * link shows only when the session holds teacher capability. */
  showInstructorPortal: boolean;
}

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
  referralLink,
  stats,
  teamLevel1,
  teamLevel2,
  meetingLink,
  messages: initialMessages,
  showInstructorPortal,
}: AmbassadorDashboardClientProps) {
  const [copied, setCopied] = useState(false);

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

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
    } catch {
      // Clipboard API unavailable (older browsers / insecure
      // context): fall back to selecting the link text.
      const input = document.getElementById('referral-link-input') as HTMLInputElement | null;
      input?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Referral link copied');
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
    { label: 'Link Clicks', value: stats.clicks, icon: <MousePointerClick className="w-5 h-5" />, color: 'blue' },
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
          Share your referral link — everyone who signs up through it joins your team.
        </p>
      </FadeIn>

      {/* Referral code + link */}
      <FadeIn>
        <Card glass>
          <p className="text-foreground font-semibold mb-1">Your referral link</p>
          <p className="text-muted text-sm mb-4">
            Your code is <span className="text-primary-text font-mono font-bold">{ambassador.referralCode}</span> —
            anyone who signs up through this link counts as your referral.
          </p>
          <div className="flex gap-2">
            <Input
              id="referral-link-input"
              value={referralLink}
              readOnly
              aria-label="Your referral link"
              className="flex-1 font-mono text-sm"
            />
            <Button onClick={copyLink} className="flex-shrink-0">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
        </Card>
      </FadeIn>

      {/* 4-stage stats — the canonical StatCard (V32): count-up values,
          staggered entrance, glass surface. Same real stage numbers;
          the stagger comes from StatCard's own entrance delay, so no
          FadeIn wrapper is needed around each card (that would fade
          the card twice). */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <StatCard key={stat.label} title={stat.label} value={stat.value} icon={stat.icon} color={stat.color} delay={0.05 + i * 0.06} glass />
        ))}
      </div>

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
            People who joined through your link (level 1), and people who joined through their links (level 2).
          </p>
          <h3 className="text-foreground font-semibold text-sm mb-2">Level 1 — direct referrals ({teamLevel1.length})</h3>
          <TeamList members={teamLevel1} emptyText="No one has joined through your link yet — share it with your campus." />
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
