import LoginForm from '@/components/auth/LoginForm';
import SavePortalLinkButton from './save-portal-link-button';

export const metadata = {
  title: 'Admin Sign In | CodeBettle',
  description: 'Sign in to the CodeBettle admin panel.',
  // The admin sign-in page must never be indexed or linked anywhere.
  robots: { index: false, follow: false },
};

/**
 * Admin sign-in page (PR #33).
 *
 * Lives at the SECRET admin base path (e.g. /portal-<random>/signin)
 * — it is not linked from the public site, the sitemap or robots.txt,
 * and the old /admin/* URLs are blocked by the proxy. The admin
 * layout exempts this page from its guard (it renders the login form
 * with no portal chrome). Admins sign in through the same form as
 * everyone else (no Admin tab — admin capability passes both tabs);
 * after login the API returns the secret dashboard URL and the form
 * redirects there.
 *
 * The page reminds the admin to save the link and offers a download
 * button, because the link cannot be found by searching.
 */
export default function AdminSigninPage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-dark-card border border-dark-border rounded-xl p-6 sm:p-8 shadow-lg">
          <div className="mb-5 text-center">
            <p className="gradient-text text-2xl font-black">CodeBettle</p>
            <h1 className="mt-3 text-xl font-bold text-foreground">Admin sign in</h1>
            <p className="mt-1 text-sm text-muted">Sign in to the admin panel</p>
          </div>
          <LoginForm />
        </div>
        <div className="mt-6 bg-dark-card border border-dark-border rounded-xl p-5 text-center">
          <p className="text-sm text-muted leading-relaxed">
            This is a private link — it is not on the public website and cannot be found by searching. Save it now.
          </p>
          <div className="mt-3">
            <SavePortalLinkButton />
          </div>
        </div>
      </div>
    </main>
  );
}
