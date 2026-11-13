'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import { CalendarCheck, Trash2 } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { BookACall, BookACallStatus } from '@/lib/db/types';

interface BookACallClientProps {
  initialBookings: BookACall[];
  total: number;
  tableMissing: boolean;
}

const STATUS_LABEL: Record<BookACallStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  done: 'Done',
};

const STATUS_BADGE: Record<BookACallStatus, 'info' | 'warning' | 'success'> = {
  new: 'info',
  contacted: 'warning',
  done: 'success',
};

export default function BookACallClient({ initialBookings, total, tableMissing }: BookACallClientProps) {
  const [list, setList] = useState(initialBookings);
  const [filter, setFilter] = useState<'all' | BookACallStatus>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const shown = filter === 'all' ? list : list.filter((b) => b.status === filter);
  const newCount = list.filter((b) => b.status === 'new').length;

  const changeStatus = async (booking: BookACall, status: BookACallStatus) => {
    const res = await fetch(`/api/admin/book-a-call/${booking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error('Could not update the request');
      return;
    }
    const data = await res.json();
    setList((l) => l.map((b) => (b.id === booking.id ? data.booking : b)));
    toast.success(`Marked as ${STATUS_LABEL[status].toLowerCase()}`);
  };

  const handleDelete = async (booking: BookACall) => {
    if (!window.confirm(`Delete the book-a-call request from ${booking.fullName}?`)) return;
    const res = await fetch(`/api/admin/book-a-call/${booking.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Could not delete the request');
      return;
    }
    setList((l) => l.filter((b) => b.id !== booking.id));
    toast.success('Request deleted');
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground">Book a Call</h1>
          <p className="text-muted text-sm mt-1">
            Free career-guidance call requests from /book-a-call
            {newCount > 0 ? ` — ${newCount} new` : ''} ({total} total)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'new', 'contacted', 'done'] as const).map((s) => (
            <Button key={s} variant={filter === s ? 'primary' : 'outline'} size="sm" onClick={() => setFilter(s)}>
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </Button>
          ))}
        </div>
      </FadeIn>

      {tableMissing && (
        <Card className="border-primary/40">
          <p className="text-foreground font-medium">Book a Call is not set up yet</p>
          <p className="text-muted text-sm mt-1">
            Run <code className="text-primary-text">codebettle-footer-bookcall-migration.sql</code> in the Supabase SQL
            Editor first — until then requests cannot be saved and this list stays empty.
          </p>
        </Card>
      )}

      {shown.length === 0 ? (
        <Card className="py-16 text-center">
          <CalendarCheck className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-foreground font-medium">No requests{filter !== 'all' ? ` — nothing ${filter}` : ' yet'}</p>
          <p className="text-muted text-sm mt-1">Requests from the /book-a-call form will appear here.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((booking, i) => {
            const expanded = expandedId === booking.id;
            return (
              <FadeIn key={booking.id} delay={Math.min(i, 4) * 0.05}>
                <Card className={booking.status === 'new' ? 'border-primary/30' : ''}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : booking.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${booking.status === 'new' ? 'bg-primary/15 text-primary-text' : 'bg-dark-border text-muted'}`}
                      >
                        <CalendarCheck className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-foreground font-medium text-sm">{booking.fullName}</p>
                          <Badge variant={STATUS_BADGE[booking.status]}>{STATUS_LABEL[booking.status]}</Badge>
                          <span className="text-muted text-xs ml-auto">{formatDateShort(booking.createdAt)}</span>
                        </div>
                        <p className="text-muted text-xs mt-0.5">
                          {booking.email}
                          {booking.phone ? ` · ${booking.phone}` : ''} · {booking.currentStatus}
                          {booking.courseInterest ? ` · ${booking.courseInterest}` : ''}
                        </p>
                        <p className={`text-muted text-sm mt-2 ${expanded ? '' : 'line-clamp-2'}`}>
                          {booking.guidanceNeeded}
                        </p>
                      </div>
                    </div>
                  </button>
                  {expanded && (
                    <div className="mt-4 pt-4 border-t border-dark-border space-y-2 text-sm">
                      {booking.preferredContact && (
                        <p className="text-muted">
                          <span className="text-foreground font-medium">Preferred contact: </span>
                          {booking.preferredContact}
                        </p>
                      )}
                      <p className="text-muted">
                        <span className="text-foreground font-medium">Email: </span>
                        <a href={`mailto:${booking.email}`} className="text-primary-text hover:underline">
                          {booking.email}
                        </a>
                        {booking.phone && (
                          <>
                            {' · '}
                            <a href={`tel:${booking.phone.replace(/\s+/g, '')}`} className="text-primary-text hover:underline">
                              {booking.phone}
                            </a>
                          </>
                        )}
                      </p>
                      <div className="flex gap-2 flex-wrap pt-2">
                        {booking.status !== 'contacted' && (
                          <Button size="sm" onClick={() => changeStatus(booking, 'contacted')}>
                            Mark contacted
                          </Button>
                        )}
                        {booking.status !== 'done' && (
                          <Button size="sm" variant="outline" onClick={() => changeStatus(booking, 'done')}>
                            Mark done
                          </Button>
                        )}
                        {booking.status !== 'new' && (
                          <Button size="sm" variant="ghost" onClick={() => changeStatus(booking, 'new')}>
                            Back to new
                          </Button>
                        )}
                        <Button size="sm" variant="danger" onClick={() => handleDelete(booking)}>
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
    </div>
  );
}
