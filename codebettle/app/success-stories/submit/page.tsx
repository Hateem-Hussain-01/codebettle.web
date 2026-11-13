import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { getSession } from '@/lib/auth';
import SuccessStoryForm from './success-story-form';

export const metadata = {
  title: 'Submit Your Success Story | CodeBettle',
  description:
    'Share your CodeBettle journey — the job you landed, the business you started, the skills that changed your life.',
};

export default async function SubmitSuccessStoryPage() {
  const session = await getSession();
  return (
    <>
      <Navbar session={session} />
      <main className="min-h-screen bg-background pt-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <SuccessStoryForm />
        </div>
      </main>
      <Footer />
    </>
  );
}
