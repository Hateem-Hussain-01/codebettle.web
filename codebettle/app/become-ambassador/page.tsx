import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { getSession } from '@/lib/auth';
import AmbassadorForm from './become-ambassador-client';

export const metadata = {
  title: 'Become our Ambassador | CodeBettle',
  description:
    'Represent CodeBettle at your campus — help more students discover coding and learning with CodeBettle.',
};

export default async function BecomeAmbassadorPage() {
  const session = await getSession();
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
          <AmbassadorForm />
        </div>
      </main>
      <Footer />
    </>
  );
}
