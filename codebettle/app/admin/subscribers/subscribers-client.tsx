'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import { Mail, Trash2 } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Subscriber } from '@/lib/db/types';

interface SubscribersClientProps {
  initialSubscribers: Subscriber[];
  total: number;
  tableMissing: boolean;
}

export default function SubscribersClient({ initialSubscribers, total, tableMissing }: SubscribersClientProps) {
  const [list, setList] = useState(initialSubscribers);

  const handleDelete = async (subscriber: Subscriber) => {
    if (!window.confirm(`Unsubscribe ${subscriber.email}?`)) return;
    const res = await fetch(`/api/admin/subscribers/${subscriber.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Could not unsubscribe');
      return;
    }
    setList((l) => l.filter((s) => s.id !== subscriber.id));
    toast.success('Subscriber removed');
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">Subscribers</h1>
        <p className="text-muted text-sm mt-1">
          Newsletter subscribers from the footer Subscribe form ({total} total)
        </p>
      </FadeIn>

      {tableMissing && (
        <Card className="border-primary/40">
          <p className="text-foreground font-medium">Subscribers are not set up yet</p>
          <p className="text-muted text-sm mt-1">
            Run <code className="text-primary-text">codebettle-footer-bookcall-migration.sql</code> in the Supabase SQL
            Editor first — until then subscriptions cannot be saved and this list stays empty.
          </p>
        </Card>
      )}

      {list.length === 0 ? (
        <Card className="py-16 text-center">
          <Mail className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-foreground font-medium">No subscribers yet</p>
          <p className="text-muted text-sm mt-1">Emails from the footer Subscribe form will appear here.</p>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-dark-border">
            {list.map((subscriber, i) => (
              <FadeIn key={subscriber.id} delay={Math.min(i, 4) * 0.02}>
                <li className="flex items-center gap-3 py-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary-text flex items-center justify-center flex-shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground font-medium text-sm truncate">{subscriber.email}</p>
                    <p className="text-muted text-xs mt-0.5">Subscribed {formatDateShort(subscriber.createdAt)}</p>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => handleDelete(subscriber)}>
                    <Trash2 className="w-4 h-4" /> Unsubscribe
                  </Button>
                </li>
              </FadeIn>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
