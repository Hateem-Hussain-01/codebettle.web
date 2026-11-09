import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { getSession } from '@/lib/auth';

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. Information We Collect',
    body: [
      'Account information: when you create an account, we collect your name, email address and phone number (if provided). Your password is stored only as a one-way bcrypt hash — we never store or see your actual password.',
      'Learning activity: the courses you enrol in, lessons you complete, quiz attempts, certificates earned and reviews you write.',
      'Messages: anything you send through the contact form or instructor application form.',
      'Technical data: a session cookie that keeps you signed in, plus basic request data (such as IP address) used only for security, for example to block repeated failed sign-in attempts.',
    ],
  },
  {
    title: '2. How We Use Your Information',
    body: [
      'To create and secure your account, deliver your courses, track your progress and issue certificates.',
      'To send you account-related messages, such as enrolment confirmations, announcements and password-reset instructions.',
      'To improve the platform and to detect and prevent misuse, fraud or unauthorised access.',
      'We do not sell your personal information to anyone, and we do not share it with advertisers.',
    ],
  },
  {
    title: '3. Cookies and Sessions',
    body: [
      'We use a single strictly necessary session cookie to keep you signed in. It contains only a random session identifier — no personal data and no account details.',
      'Signing out deletes the session immediately. Suspending an account also ends all of its sessions.',
    ],
  },
  {
    title: '4. Data Security',
    body: [
      'Passwords are hashed with bcrypt. Access to administrative functions is restricted by role, and administrative actions are recorded in an audit log.',
      'No method of storage or transmission is completely secure. If you believe your account has been compromised, contact us immediately so we can revoke its sessions and help you reset your password.',
    ],
  },
  {
    title: '5. Your Rights',
    body: [
      'You may ask us for a copy of the personal information we hold about you, ask us to correct it, or ask us to delete your account and its personal data, subject to records we must keep for certificates and payments already issued.',
      'To make any such request, email info@codebettle.com from the email address on your account.',
    ],
  },
  {
    title: '6. Children',
    body: [
      'CodeBettle is intended for learners aged 16 and over. If you are under 16, please use the platform only with a parent or guardian’s permission.',
    ],
  },
  {
    title: '7. Changes to This Policy',
    body: [
      'We may update this policy from time to time. The “Last updated” date below will change, and significant changes will be announced on the platform.',
    ],
  },
];

export default async function PrivacyPage() {
  const session = await getSession();

  return (
    <>
      <Navbar session={session} />
      <main className="min-h-screen bg-background pt-16">
        <div className="py-16 bg-dark-card border-b border-dark-border">
          <div className="max-w-3xl mx-auto px-4">
            <h1 className="text-4xl font-black text-white">Privacy Policy</h1>
            <p className="text-muted text-sm mt-2">Last updated: 9 November 2026</p>
            <p className="text-muted leading-relaxed mt-4">
              CodeBettle (“we”, “us”) operates this learning platform. This policy
              explains what personal information we collect, how we use it, and the
              choices you have. Questions: info@codebettle.com.
            </p>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold text-white mb-3">{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph.slice(0, 32)} className="text-muted leading-relaxed mb-3">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
