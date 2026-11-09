import { redirect } from 'next/navigation';
import { getSetupStatus } from '@/lib/services/first-run';
import SetupForm from './setup-form';

/**
 * First-run admin setup page (master prompt §8).
 * Server component: checks setup status and redirects to login once
 * both official admins have claimed their accounts. The form itself is
 * a client component with real backend functionality (POST /api/auth/setup).
 */
export default async function SetupPage() {
  const status = await getSetupStatus();
  if (status.complete) redirect('/auth/login');
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[100px]" />
      </div>
      <div className="relative w-full max-w-md">
        <SetupForm admins={status.admins} />
      </div>
    </div>
  );
}
