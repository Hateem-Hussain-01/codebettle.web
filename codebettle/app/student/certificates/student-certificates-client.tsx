'use client';
import { useState } from 'react';
import { Award, Download } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import toast from 'react-hot-toast';
import type { Certificate, PublicCourse } from '@/lib/db/types';
import { formatDate } from '@/lib/utils';

interface StudentCertificatesClientProps {
  certificates: Certificate[];
  coursesById: Record<string, PublicCourse>;
  studentName: string;
}

export default function StudentCertificatesClient({ certificates, coursesById, studentName }: StudentCertificatesClientProps) {
  const items = certificates.map(c => ({ cert: c, course: coursesById[c.courseId] })).filter(i => i.course);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Download the real certificate PDF (generated on demand by the
  // server from the course's HTML template — never stored, never HTML).
  const handleDownload = async (cert: Certificate) => {
    setDownloadingId(cert.id);
    try {
      const res = await fetch(`/api/certificates/${cert.id}/download`);
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
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">My Certificates</h1>
        <p className="text-muted text-sm mt-1">{items.length} certificate{items.length !== 1 ? 's' : ''} earned</p>
      </FadeIn>

      {items.length === 0 ? (
        <Card className="py-16 text-center">
          <Award className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-foreground font-semibold mb-2">No certificates yet</p>
          <p className="text-muted text-sm">Complete a course to earn your first certificate.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map(({ cert, course }, i) => (
            <FadeIn key={cert.id} delay={Math.min(i % 3, 2) * 0.07} className="bg-gradient-to-br from-dark-card to-surface border border-primary/30 rounded-xl p-6 hover:border-primary/60 transition-all hover:shadow-[0_0_20px_rgba(245,197,24,0.1)]">
              <div className="text-center mb-4">
                <Award className="w-12 h-12 text-primary-text mx-auto mb-3" />
                <p className="text-xs font-bold text-primary-text uppercase tracking-wider mb-1">Certificate of Completion</p>
                <p className="text-muted text-xs mb-2">{studentName}</p>
                <h3 className="text-foreground font-bold text-sm leading-snug">{course!.title}</h3>
              </div>
              <div className="text-center text-xs text-muted mb-4">
                <p>Issued: {formatDate(cert.issuedAt)}</p>
                <p className="text-primary-text font-mono mt-1">{cert.certificateNumber}</p>
              </div>
              <Button
                fullWidth
                size="sm"
                variant="outline"
                loading={downloadingId === cert.id}
                onClick={() => handleDownload(cert)}
              >
                <Download className="w-3.5 h-3.5" /> Download
              </Button>
            </FadeIn>
          ))}
        </div>
      )}
    </div>
  );
}
