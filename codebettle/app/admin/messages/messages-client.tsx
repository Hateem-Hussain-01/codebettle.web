'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Mail, MailOpen, Trash2 } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { ContactMessage } from '@/lib/db/types';

interface MessagesClientProps {
  initialMessages: ContactMessage[];
  total: number;
}

export default function MessagesClient({ initialMessages, total }: MessagesClientProps) {
  const [list, setList] = useState(initialMessages);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const shown = unreadOnly ? list.filter(m => !m.isRead) : list;
  const unreadCount = list.filter(m => !m.isRead).length;

  const toggleRead = async (msg: ContactMessage) => {
    const res = await fetch(`/api/admin/messages/${msg.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRead: !msg.isRead }),
    });
    if (!res.ok) { toast.error('Could not update the message'); return; }
    const data = await res.json();
    setList(l => l.map(m => (m.id === msg.id ? data.message : m)));
  };

  const handleDelete = async (msg: ContactMessage) => {
    if (!window.confirm(`Delete the message from ${msg.name}?`)) return;
    const res = await fetch(`/api/admin/messages/${msg.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Could not delete the message'); return; }
    setList(l => l.filter(m => m.id !== msg.id));
    toast.success('Message deleted');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">Messages</h1>
          <p className="text-muted text-sm mt-1">
            Contact-form messages from visitors{unreadCount > 0 ? ` — ${unreadCount} unread` : ''} ({total} total)
          </p>
        </div>
        <Button variant={unreadOnly ? 'primary' : 'outline'} onClick={() => setUnreadOnly(v => !v)}>
          {unreadOnly ? 'Showing unread only' : 'Show unread only'}
        </Button>
      </div>

      {shown.length === 0 ? (
        <Card className="py-16 text-center">
          <Mail className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-white font-medium">No messages{unreadOnly ? ' — nothing unread' : ' yet'}</p>
          <p className="text-muted text-sm mt-1">Messages sent through the contact form will appear here.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map(msg => {
            const expanded = expandedId === msg.id;
            return (
              <Card key={msg.id} className={msg.isRead ? '' : 'border-primary/30'}>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : msg.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${msg.isRead ? 'bg-dark-border text-muted' : 'bg-primary/15 text-primary'}`}>
                      {msg.isRead ? <MailOpen className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-medium text-sm">{msg.name}</p>
                        {!msg.isRead && <Badge variant="info">Unread</Badge>}
                        <span className="text-muted text-xs ml-auto">{formatDateShort(msg.createdAt)}</span>
                      </div>
                      <p className="text-muted text-xs mt-0.5">{msg.email}{msg.subject ? ` · ${msg.subject}` : ''}</p>
                      <p className={`text-muted text-sm mt-2 ${expanded ? '' : 'line-clamp-2'}`}>{msg.message}</p>
                    </div>
                  </div>
                </button>
                <div className="flex gap-2 mt-3 ml-12">
                  <Button variant="outline" size="sm" onClick={() => toggleRead(msg)}>
                    Mark as {msg.isRead ? 'unread' : 'read'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(msg)}>
                    <Trash2 className="w-3.5 h-3.5" />Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
