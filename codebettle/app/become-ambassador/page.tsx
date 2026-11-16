import { redirect } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { getSession } from '@/lib/auth';
import { getLatestAmbassadorApplicationByEmail } from '@/lib/db/ambassador-applications';
import AmbassadorForm from './become-ambassador-client';

export const metadata = {
  title: 'Become our Ambassador | CodeBettle',
  description:
    'Represent CodeBettle at your campus — help more students discover coding and learning with CodeBettle.',
};

/**
 * Register-first apply (Eman, 16 Nov 2026): applying needs an
 * account. A logged-out visitor is sent to register (and comes back
 * here via ?redirect=), and a signed-in visitor sees ONLY the
 * application form — or, when they already applied, the status of
 * that application instead of a second blank form. Fail-safe: if the
 * application lookup throws (e.g. the table is not set up yet), the
 * form still shows and the API answers with its own 503.
 */
export default async function BecomeAmbassadorPage() {
  const session = await getSession();
  if (!session) redirect('/auth/register?redirect=/become-ambassador');

  let existingApplication = null;
  try {
    existingApplication = await getLatestAmbassadorApplicationByEmail(session.email);
  } catch {
    existingApplication = null;
  }

  return (
    <>
      <Navbar session={session} />
      <main className="min-h-screen bg-background pt-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <h1 className="text-3xl font-bold text-foreground mb-2">Become our Ambassador</h1>
          <p className="text-muted text-sm leading-relaxed mb-6">
            Love CodeBettle? Represent us at your university or college, spread the word, and help more students start
            learning. Tell us a little about yourself — our team reviews every application.
          </p>
          <p className="text-muted text-sm mb-6">
            Already an ambassador?{' '}
            <a href="/ambassador/login?redirect=/student/ambassador" className="text-primary-text hover:underline">
              Log in to your Ambassador Dashboard
            </a>
          </p>
          <AmbassadorForm email={session.email} existingApplication={existingApplication} />
        </div>
      </main>
      <Footer />
    </>
  );
}
