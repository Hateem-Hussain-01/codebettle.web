import { connection } from 'next/server';
import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FadeIn from '@/components/ui/FadeIn';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Award, BadgeCheck, XCircle } from 'lucide-react';
import { getCertificateByToken } from '@/lib/db/certificates';
import { getCourseById } from '@/lib/db/courses';
import { getUserById } from '@/lib/db/users';
import { formatDate } from '@/lib/utils';

/**
 * Public certificate verification page (Phase 7).
 * /verify/<token> — anyone with a certificate's verification token can
 * confirm it is genuine. Shows only the four public facts (student,
 * course, certificate number, issued date); nothing else about the
 * student is exposed. `await connection()` opts out of build-time
 * prerendering (public page, token only known at request time).
 */
export default async function VerifyCertificatePage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const certificate = await getCertificateByToken(token);
  const student = certificate ? await getUserById(certificate.studentId) : null;
  const course = certificate ? await getCourseById(certificate.courseId) : null;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16">
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-16">
          <FadeIn className="text-center mb-8">
            <Award className="w-12 h-12 text-primary-text mx-auto mb-3" />
            <h1 className="text-3xl font-black text-foreground">Verify Certificate</h1>
            <p className="text-muted mt-2 text-sm">Check that a CodeBettle certificate is genuine.</p>
          </FadeIn>

          <FadeIn delay={0.08}>
          {certificate ? (
            <Card className="border-primary/30">
              <div className="flex items-center gap-2 mb-5">
                <BadgeCheck className="w-6 h-6 text-green-400" />
                <h2 className="text-foreground font-bold">Verified — this certificate is genuine</h2>
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Awarded to</dt>
                  <dd className="text-foreground font-medium text-right">{student?.name ?? 'Unknown student'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Course</dt>
                  <dd className="text-foreground font-medium text-right">{course?.title ?? 'Unknown course'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Certificate no.</dt>
                  <dd className="text-foreground font-medium text-right">{certificate.certificateNumber}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Issued</dt>
                  <dd className="text-foreground font-medium text-right">{formatDate(certificate.issuedAt)}</dd>
                </div>
              </dl>
            </Card>
          ) : (
            <Card className="border-red-500/30">
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="w-6 h-6 text-red-400" />
                <h2 className="text-foreground font-bold">Certificate not found</h2>
              </div>
              <p className="text-muted text-sm">
                No certificate matches this verification token. Check the token
                printed on the certificate and try again — or use the lookup
                form to enter it by hand.
              </p>
              <div className="mt-5">
                <Link href="/verify">
                  <Button>Look up a certificate</Button>
                </Link>
              </div>
            </Card>
          )}
          </FadeIn>
        </div>
      </main>
      <Footer />
    </>
  );
}
