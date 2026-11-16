'use client';
import { useState } from 'react';
import { Eye, LogOut } from 'lucide-react';

/**
 * View-as banner (Phase 2, Module 21.4).
 *
 * Shown at the top of a portal while an admin is viewing it on
 * someone's behalf. The viewing is read-only: write routes refuse
 * mutations while the banner is up (see assertNotViewAs).
 * "Return to Admin Panel" ends the viewing session (clears the
 * view-as cookie server-side, audit-logged) and navigates back.
 * The return URL defaults to the admin Instructors page — the
 * teacher view-as entry point — and its base path is the secret
 * admin URL (PR #33), passed in by the layout (a server component
 * reads it from the env var); dev default 'admin'. Ambassador
 * view-as passes returnPath 'ambassadors' + viewedPortal
 * "ambassador's" so the banner names the right portal and returns
 * to the Ambassadors page.
 */
export default function ViewAsBanner({
  adminName,
  adminBasePath = 'admin',
  returnPath = 'instructors',
  viewedPortal = "teacher's",
}: {
  adminName: string;
  adminBasePath?: string;
  /** Admin page (under the secret base path) the banner returns to. */
  returnPath?: string;
  /** Portal being viewed, for the banner text ("teacher's" / "ambassador's"). */
  viewedPortal?: string;
}) {
  const [leaving, setLeaving] = useState(false);

  const handleReturn = async () => {
    setLeaving(true);
    try {
      await fetch('/api/admin/view-as/exit', { method: 'POST' });
    } catch {
      // The cookie clear is best-effort from here — navigate anyway;
      // the admin layout redirects back if the cookie is still set.
    } finally {
      // View-as starts from the Instructors page (teacher) or the
      // Ambassadors page (ambassador) — return there.
      window.location.href = `/${adminBasePath}/${returnPath}`;
    }
  };

  return (
    <div className="bg-amber-500 text-ink px-4 py-2.5 flex items-center justify-between gap-3 text-sm sticky top-0 z-50">
      <p className="flex items-center gap-2 min-w-0">
        <Eye className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">
          <strong>Admin viewing:</strong> {adminName} is viewing this {viewedPortal} portal. View-only — changes are disabled.
        </span>
      </p>
      {/* Theme audit: the banner is fixed amber in both themes, so this
          button stays fixed black/white too — no fixed-white text token exists. */}
      <button
        onClick={handleReturn}
        disabled={leaving}
        className="flex items-center gap-1.5 bg-black text-white rounded-md px-3 py-1.5 text-xs font-semibold hover:opacity-80 transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0"
      >
        <LogOut className="w-3.5 h-3.5" />
        {leaving ? 'Returning…' : 'Return to Admin Panel'}
      </button>
    </div>
  );
}
