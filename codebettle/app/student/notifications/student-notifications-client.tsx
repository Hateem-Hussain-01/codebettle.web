'use client';
import { useState } from 'react';
import { Bell, CheckCheck, ChevronLeft, ChevronRight, Settings, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FadeIn from '@/components/ui/FadeIn';
import { formatDateShort } from '@/lib/utils';
import type { Notification, NotificationEventKey, NotificationPrefs } from '@/lib/db/types';
import toast from 'react-hot-toast';

export interface NotificationsClientProps {
  initialNotifications: Notification[];
  initialUnreadCount: number;
  initialPage: number;
  initialTotalPages: number;
  initialPreferences: NotificationPrefs;
}

const TYPE_STYLES: Record<string, string> = {
  announcement: 'bg-blue-400/10 text-blue-400',
  certificate: 'bg-primary/10 text-primary',
  completion: 'bg-green-400/10 text-green-400',
  enrollment: 'bg-blue-400/10 text-blue-400',
  application: 'bg-purple-400/10 text-purple-400',
};

const EVENT_LABELS: { key: NotificationEventKey; label: string }[] = [
  { key: 'enrollment', label: 'Enrolments' },
  { key: 'completion', label: 'Course completions' },
  { key: 'certificate', label: 'Certificates' },
  { key: 'application', label: 'Instructor applications' },
  { key: 'announcement', label: 'Announcements' },
];

export default function NotificationsClient({
  initialNotifications,
  initialUnreadCount,
  initialPage,
  initialTotalPages,
  initialPreferences,
}: NotificationsClientProps) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [unread, setUnread] = useState(initialUnreadCount);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [preferences, setPreferences] = useState<NotificationPrefs>(initialPreferences);
  const [showPrefs, setShowPrefs] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadPage = async (nextPage: number) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/notifications?page=${nextPage}`);
      if (!res.ok) throw new Error('Failed to load notifications');
      const data = await res.json();
      setNotifications(data.notifications);
      setUnread(data.unreadCount);
      setPage(data.page);
      setTotalPages(data.totalPages);
    } catch {
      toast.error('Could not load notifications');
    } finally {
      setBusy(false);
    }
  };

  const markRead = async (id: string) => {
    const target = notifications.find((n) => n.id === id);
    if (!target || target.readAt) return;
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to mark as read');
      const data = await res.json();
      setNotifications((ns) => ns.map((n) => (n.id === id ? data.notification : n)));
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      toast.error('Could not mark as read');
    }
  };

  const markAllRead = async () => {
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to mark all as read');
      setNotifications((ns) => ns.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString().slice(0, 10) })));
      setUnread(0);
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Could not mark all as read');
    }
  };

  const deleteNotification = async (id: string) => {
    const target = notifications.find((n) => n.id === id);
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setNotifications((ns) => ns.filter((n) => n.id !== id));
      if (target && !target.readAt) setUnread((u) => Math.max(0, u - 1));
      toast.success('Notification deleted');
    } catch {
      toast.error('Could not delete notification');
    }
  };

  const savePreferences = async (next: NotificationPrefs) => {
    setPreferences(next);
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error('Failed to save preferences');
      toast.success('Preferences saved');
    } catch {
      setPreferences(preferences);
      toast.error('Could not save preferences');
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Notifications</h1>
          <p className="text-muted text-sm mt-1">{unread} unread notification{unread !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowPrefs((v) => !v)}>
            <Settings className="w-4 h-4" />Preferences
          </Button>
          {unread > 0 && <Button variant="secondary" size="sm" onClick={markAllRead}><CheckCheck className="w-4 h-4" />Mark All Read</Button>}
        </div>
      </FadeIn>

      {showPrefs && (
        <Card className="p-4 space-y-3">
          <p className="text-white font-semibold text-sm">Notification preferences</p>
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.inApp}
              onChange={(e) => savePreferences({ ...preferences, inApp: e.target.checked })}
              className="accent-yellow-500"
            />
            In-app notifications
          </label>
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.email}
              onChange={(e) => savePreferences({ ...preferences, email: e.target.checked })}
              className="accent-yellow-500"
            />
            Email notifications
          </label>
          <p className="text-muted text-xs">Email delivery is not configured yet — turning email on has no effect until Resend is connected.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {EVENT_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.events[key]}
                  onChange={(e) =>
                    savePreferences({ ...preferences, events: { ...preferences.events, [key]: e.target.checked } })
                  }
                  className="accent-yellow-500"
                />
                {label}
              </label>
            ))}
          </div>
        </Card>
      )}

      {notifications.length === 0 ? (
        <Card className="py-16 text-center">
          <Bell className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-white font-semibold">No notifications</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif, i) => {
            const isRead = Boolean(notif.readAt);
            return (
              <FadeIn key={notif.id} delay={Math.min(i, 4) * 0.05}>
              <div
                onClick={() => markRead(notif.id)}
                className={`bg-dark-card border rounded-xl p-4 flex items-start gap-4 transition-all cursor-pointer ${isRead ? 'border-dark-border opacity-60' : 'border-primary/20'}`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${TYPE_STYLES[notif.type] ?? TYPE_STYLES.announcement}`}>
                  <Bell className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium ${isRead ? 'text-muted' : 'text-white'}`}>{notif.title}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notif.id);
                      }}
                      className="text-muted hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-muted text-xs mt-1 line-clamp-2">{notif.body}</p>
                  <p className="text-muted text-xs mt-2">{formatDateShort(notif.createdAt)}</p>
                </div>
                {!isRead && <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-2" />}
              </div>
              </FadeIn>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={page <= 1 || busy} onClick={() => loadPage(page - 1)}>
            <ChevronLeft className="w-4 h-4" />Previous
          </Button>
          <p className="text-muted text-xs">Page {page} of {totalPages}</p>
          <Button variant="secondary" size="sm" disabled={page >= totalPages || busy} onClick={() => loadPage(page + 1)}>
            Next<ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
