import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FadeIn from '@/components/ui/FadeIn';
import { getSession } from '@/lib/auth';

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. About CodeBettle',
    body: [
      'CodeBettle is an online learning platform offering live and recorded technology courses, including programming, web and mobile development, data science, design and DevOps. By creating an account or using the platform, you agree to these terms.',
    ],
  },
  {
    title: '2. Accounts',
    body: [
      'You are responsible for keeping your sign-in credentials private and for everything done through your account.',
      'One account per person. Sharing accounts, or letting someone else use your account, is not allowed.',
      'You must provide accurate information when registering. We may suspend or close accounts that are used to mislead, abuse or harm other learners or the platform.',
      'Student, instructor and administrator accounts have different permissions. Attempting to access functions outside your role is a violation of these terms.',
    ],
  },
  {
    title: '3. Courses and Enrolment',
    body: [
      'Course descriptions, schedules, prices and instructors are shown on each course page. Live class schedules may change; enrolled students will be notified of changes.',
      'Enrolling in a course gives you access for learning purposes only. Course materials, recordings and content are for your personal use and must not be copied, shared, resold or published without permission.',
      'Certificates are issued only when the course completion requirements are met, as determined by the instructor and the platform.',
    ],
  },
  {
    title: '4. Payments and Refunds',
    body: [
      'Paid courses are charged in Pakistani Rupees (PKR) at the price shown at the time of enrolment. Payment is confirmed before access is granted.',
      'If a course is cancelled by CodeBettle, or is materially different from its description, you may request a refund by emailing info@codebettle.com within 7 days of enrolment. Refund requests are reviewed case by case.',
      'Access already used (for example, live classes attended or recordings watched) may affect refund eligibility.',
    ],
  },
  {
    title: '5. Acceptable Use',
    body: [
      'Do not upload, share or send anything unlawful, abusive, misleading or harmful. Do not attempt to access other users’ accounts, impersonate anyone, or probe the platform for security weaknesses.',
      'Do not use automated tools to scrape content, create fake accounts, or disrupt the service.',
      'Reviews must reflect your genuine experience of a course you are enrolled in.',
    ],
  },
  {
    title: '6. Instructor Applications',
    body: [
      'Applying to teach does not guarantee acceptance. Approved instructors teach only the courses assigned to them, and must deliver the content, schedule and quality standards agreed with CodeBettle.',
    ],
  },
  {
    title: '7. Intellectual Property',
    body: [
      'All course content, branding and platform materials belong to CodeBettle or its instructors and are protected by law. You may not reproduce or distribute them without written permission.',
      'By posting a review or other content on the platform, you give CodeBettle permission to display it in connection with the relevant course.',
    ],
  },
  {
    title: '8. Availability and Liability',
    body: [
      'We work to keep the platform available, but we do not guarantee uninterrupted access. Live class times, instructors and content may change, and we will notify enrolled students of significant changes.',
      'To the extent permitted by law, CodeBettle is not liable for indirect losses arising from use of the platform. Nothing in these terms limits liability that cannot legally be limited.',
    ],
  },
  {
    title: '9. Changes to These Terms',
    body: [
      'We may update these terms from time to time. The “Last updated” date below will change, and continued use of the platform after a change means you accept the updated terms.',
    ],
  },
];

export default async function TermsPage() {
  const session = await getSession();

  return (
    <>
      <Navbar session={session} />
      <main className="min-h-screen bg-background pt-16">
        <div className="py-16 bg-dark-card border-b border-dark-border">
          <FadeIn className="max-w-3xl mx-auto px-4">
            <h1 className="text-4xl font-black text-foreground">Terms of Service</h1>
            <p className="text-muted text-sm mt-2">Last updated: 9 November 2026</p>
            <p className="text-muted leading-relaxed mt-4">
              These terms govern your use of the CodeBettle platform. If you do not
              agree with them, please do not create an account or enrol in a course.
              Questions: info@codebettle.com.
            </p>
          </FadeIn>
        </div>
        <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">
          {SECTIONS.map((section, i) => (
            <FadeIn key={section.title} delay={Math.min(i, 3) * 0.05}>
            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph.slice(0, 32)} className="text-muted leading-relaxed mb-3">
                  {paragraph}
                </p>
              ))}
            </section>
            </FadeIn>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
