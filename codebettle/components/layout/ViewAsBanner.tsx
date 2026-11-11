'use client';
import { useState } from 'react';
import { Eye, LogOut } from 'lucide-react';

/**
 * View-as banner (Phase 2, Module 21.4).
 *
 * Shown at the top of the Teacher Portal while an admin is viewing
 * it on a teacher's behalf. The viewing is read-only: write routes
 * refuse mutations while the banner is up (see assertNotViewAs).
 * "Return to Admin Panel" ends the viewing session (clears the
 * view-as cookie server-side, audit-logged) and navigates back.
 */
export default function ViewAsBanner({ adminName }: { adminName: string }) {
  const [leaving, setLeaving] = useState(false);

  const handleReturn = async () => {
    setLeaving(true);
    try {
      await fetch('/api/admin/view-as/exit', { method: 'POST' });
    } catch {
      // The cookie clear is best-effort from here — navigate anyway;
      // the admin layout redirects back if the cookie is still set.
    } finally {
      window.location.href = '/admin/applications';
    }
  };

  return (
    <div className="bg-amber-500 text-black px-4 py-2.5 flex items-center justify-between gap-3 text-sm sticky top-0 z-50">
      <p className="flex items-center gap-2 min-w-0">
        <Eye className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">
          <strong>Admin viewing:</strong> {adminName} is viewing this teacher&apos;s portal. View-only — changes are disabled.
        </span>
      </p>
      <button
        onClick={handleReturn}
        disabled={leaving}
        className="flex items-center gap-1.5 bg-black text-white rounded-md px-3 py-1.5 text-xs font-semibold hover:bg-dark-card transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0"
      >
        <LogOut className="w-3.5 h-3.5" />
        {leaving ? 'Returning…' : 'Return to Admin Panel'}
      </button>
    </div>
  );
}
