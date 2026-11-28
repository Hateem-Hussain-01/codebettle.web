'use client';
import { useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FadeIn from '@/components/ui/FadeIn';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { Award, Download, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate } from '@/lib/utils';

interface FoundCertificate {
  id: string;
  certificateNumber: string;
  courseTitle: string;
  batch: string | null;
  issuedAt: string;
  revokedAt: string | null;
  verificationToken: string;
}

/**
 * Temporary certificate form (Eman, 28 Nov 2026): Batch 08 students
 * download their certificates with the email they enrolled with — no
 * login, no password — until the site launches. One link for every
 * student: /certificates. The lookup only ever answers for a matching
 * email, and the download only ever serves a certificate to its own
 * verification token (see app/api/certificates/lookup/route.ts and the
 * download route). Once the site is live, the student portal has the
 * same download for signed-in students.
 */
export default function CertificatesPage() {
  const [email, setEmail] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [searched, setSearched] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [certificates, setCertificates] = useState<FoundCertificate[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) {
      toast.error('Enter your email address');
      return;
    }
    setLookingUp(true);
    try {
      const res = await fetch('/api/certificates/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error((data as { error?: string } | null)?.error || 'Could not look up certificates');
        return;
      }
      setSearched(true);
      if ((data as { status?: string } | null)?.status === 'found') {
        setStudentName((data as { studentName?: string }).studentName ?? '');
        setCertificates((data as { certificates?: FoundCertificate[] }).certificates ?? []);
      } else {
        setStudentName('');
        setCertificates([]);
      }
    } catch {
      toast.error('Could not look up certificates. Please try again.');
    } finally {
      setLookingUp(false);
    }
  };

  const handleDownload = async (cert: FoundCertificate) => {
    setDownloadingId(cert.id);
    try {
      const res = await fetch(
        `/api/certificates/${cert.id}/download?token=${encodeURIComponent(cert.verificationToken)}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error((data as { error?: string } | null)?.error || 'Could not download the certificate');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CodeBettle-Certificate-${cert.certificateNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Certificate downloaded!');
    } catch {
      toast.error('Could not download the certificate');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16">
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-16">
          <FadeIn className="text-center mb-8">
            <Award className="w-12 h-12 text-primary-text mx-auto mb-3" />
            <h1 className="text-3xl font-black text-foreground">Download Your Certificate</h1>
            <p className="text-muted mt-2 text-sm">
              Enter the email you enrolled with. No login needed — your certificate will appear below.
            </p>
          </FadeIn>
          <FadeIn delay={0.08}>
            <Card>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Email address"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={lookingUp}
                />
                <Button fullWidth type="submit" disabled={lookingUp}>
                  {lookingUp ? 'Looking up…' : 'Find My Certificate'}
                </Button>
              </form>
            </Card>
          </FadeIn>

          {searched && certificates.length > 0 && (
            <FadeIn delay={0.1} className="mt-6">
              <p className="text-foreground font-semibold mb-3">
                {studentName ? `Certificates for ${studentName}` : 'Your certificates'}
              </p>
              <div className="space-y-3">
                {certificates.map((cert) => (
                  <Card key={cert.id} className={cert.revokedAt ? 'border-amber-500/40' : 'border-primary/30'}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-foreground font-bold">{cert.courseTitle}</p>
                        <p className="text-muted text-sm mt-1">
                          Certificate no. {cert.certificateNumber}
                          {cert.batch ? ` · ${cert.batch}` : ''}
                          {` · Issued ${formatDate(cert.issuedAt)}`}
                        </p>
                        {cert.revokedAt && (
                          <p className="text-amber-400 text-sm mt-1 flex items-center gap-1">
                            <ShieldAlert className="w-4 h-4" />
                            This certificate was revoked — contact CodeBettle if this is a mistake.
                          </p>
                        )}
                      </div>
                      {!cert.revokedAt && (
                        <Button
                          type="button"
                          onClick={() => handleDownload(cert)}
                          disabled={downloadingId === cert.id}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          {downloadingId === cert.id ? 'Generating…' : 'Download'}
                        </Button>
                      )}
                    </div>
                    {downloadingId === cert.id && (
                      <p className="text-muted text-sm mt-3">
                        Your PDF is being generated — this can take up to a minute the first time.
                      </p>
                    )}
                  </Card>
                ))}
              </div>
              <p className="text-muted text-sm mt-4">
                Your certificate stays saved — the QR on the PDF verifies it any time.
              </p>
            </FadeIn>
          )}

          {searched && certificates.length === 0 && (
            <FadeIn delay={0.1} className="mt-6">
              <Card>
                <p className="text-foreground font-semibold">No certificate was found for this email.</p>
                <p className="text-muted text-sm mt-1">
                  Check the email and try again — use the email you enrolled with. If your course is complete
                  and you still can&apos;t find it, contact CodeBettle.
                </p>
              </Card>
            </FadeIn>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
