'use client';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Award, Plus } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Certificate, Course, SafeUser } from '@/lib/db/types';

interface CertificatesClientProps {
  certificates: Certificate[];
  students: Record<string, SafeUser>;
  courses: Record<string, Course>;
}

export default function CertificatesClient({ certificates, students, courses }: CertificatesClientProps) {
  const items = certificates.map(c => ({
    cert: c,
    student: students[c.studentId],
    course: courses[c.courseId],
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Certificates</h1>
          <p className="text-muted text-sm mt-1">{certificates.length} certificates issued</p>
        </div>
        <Button onClick={() => toast.success('Manual certificate issued!')}><Plus className="w-4 h-4" />Issue Certificate</Button>
      </div>

      <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border bg-dark-border/20">
                {['Certificate No', 'Student', 'Course', 'Issued Date', 'Status'].map(h => (
                  <th key={h} className="text-left text-muted text-xs py-3 px-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(({ cert, student, course }) => (
                <tr key={cert.id} className="border-b border-dark-border/40 last:border-0 hover:bg-dark-border/10">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-primary" />
                      <span className="text-primary font-mono text-xs font-bold">{cert.certificateNumber}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <img src={student?.avatar || ''} alt={student?.name} className="w-7 h-7 rounded-full" />
                      <span className="text-white text-xs">{student?.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted text-xs max-w-[160px] truncate">{course?.title}</td>
                  <td className="py-3 px-4 text-muted text-xs">{formatDate(cert.issuedAt)}</td>
                  <td className="py-3 px-4"><Badge variant="success">Valid</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
