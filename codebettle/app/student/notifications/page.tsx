'use client';
import { useState } from 'react';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatDateShort } from '@/lib/utils';
import { getSiteWideAnnouncements } from '@/lib/data/announcements';
import toast from 'react-hot-toast';

interface Notification {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  type: 'announcement' | 'certificate' | 'lesson';
}

export default function StudentNotificationsPage() {
  const announcements = getSiteWideAnnouncements();
  const [notifications, setNotifications] = useState<Notification[]>([
    ...announcements.map(a => ({
      id: a.id, title: a.title, message: a.content, date: a.createdAt,
      read: false, type: 'announcement' as const,
    })),
    { id: 'n1', title: 'Certificate Earned!', message: 'Congratulations! You earned a certificate for Python for Data Science & ML.', date: '2024-04-01', read: true, type: 'certificate' },
    { id: 'n2', title: 'New Lesson Added', message: 'A new lesson "TypeScript Advanced Types" has been added to Complete React & Next.js Mastery.', date: '2024-05-20', read: false, type: 'lesson' },
  ]);

  const unread = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(n => n.map(notif => ({ ...notif, read: true })));
    toast.success('All notifications marked as read');
  };

  const deleteNotification = (id: string) => {
    setNotifications(n => n.filter(notif => notif.id !== id));
  };

  const typeColors = { announcement: 'bg-blue-400/10 text-blue-400', certificate: 'bg-primary/10 text-primary', lesson: 'bg-green-400/10 text-green-400' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Notifications</h1>
          <p className="text-muted text-sm mt-1">{unread} unread notification{unread !== 1 ? 's' : ''}</p>
        </div>
        {unread > 0 && <Button variant="secondary" size="sm" onClick={markAllRead}><CheckCheck className="w-4 h-4" />Mark All Read</Button>}
      </div>

      {notifications.length === 0 ? (
        <Card className="py-16 text-center">
          <Bell className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-white font-semibold">No notifications</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map(notif => (
            <div key={notif.id} className={`bg-dark-card border rounded-xl p-4 flex items-start gap-4 transition-all ${notif.read ? 'border-dark-border opacity-60' : 'border-primary/20'}`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${typeColors[notif.type]}`}>
                <Bell className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-medium ${notif.read ? 'text-muted' : 'text-white'}`}>{notif.title}</p>
                  <button onClick={() => deleteNotification(notif.id)} className="text-muted hover:text-red-400 transition-colors cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <p className="text-muted text-xs mt-1 line-clamp-2">{notif.message}</p>
                <p className="text-muted text-xs mt-2">{formatDateShort(notif.date)}</p>
              </div>
              {!notif.read && <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-2" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
