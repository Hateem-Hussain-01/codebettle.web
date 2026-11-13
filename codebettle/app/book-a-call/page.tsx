import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { getSession } from '@/lib/auth';
import BookACallForm from './book-a-call-client';

export const metadata = {
  title: 'Book a Call | CodeBettle',
  description:
    'Book a free career-guidance call with the CodeBettle team — talk about your learning path, courses and what comes next.',
};

export default async function BookACallPage() {
  const session = await getSession();
  return (
    <>
      <Navbar session={session} />
      <main className="min-h-screen bg-background pt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-start">
            {/* Form (left) — compact: 7 questions in a tight 2-column grid. */}
            <div className="lg:col-span-3">
              <h1 className="text-3xl font-bold text-foreground mb-2">Book a Call</h1>
              <p className="text-muted text-sm mb-6">
                Tell us a little about yourself and what guidance you need — we will get back to you to fix a time.
              </p>
              <BookACallForm />
            </div>
            {/* Supporting text (right). Generic wording only — no invented numbers. */}
            <div className="lg:col-span-2">
              <div className="bg-dark-card border border-dark-border rounded-xl p-6">
                <h2 className="text-lg font-semibold text-foreground mb-3">A free call with our team</h2>
                <p className="text-muted text-sm leading-relaxed mb-4">
                  CodeBettle cares a lot about its students, and has guided many students on their learning journey —
                  choosing the right course, planning the next step, and figuring out what comes after.
                </p>
                <p className="text-muted text-sm leading-relaxed mb-4">
                  This call is free. Tell us where you are now and what you are stuck on, and we will talk it through
                  with you — no pressure, no obligation.
                </p>
                <h3 className="text-sm font-semibold text-foreground mb-2">What happens next?</h3>
                <ul className="text-muted text-sm leading-relaxed space-y-1.5 list-disc list-inside">
                  <li>Your request is saved and shared with our team.</li>
                  <li>We reply to you directly to fix a time for the call.</li>
                  <li>The call is about your questions — nothing else.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
