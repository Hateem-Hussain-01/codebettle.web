'use client';
import { useState, useRef } from 'react';
import { Award, Download } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
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

  const handleDownload = (certNumber: string, courseName: string, studentName: string, issuedDate: string) => {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Certificate</title>
<style>body{margin:0;background:#111;font-family:Arial,sans-serif}.cert{width:900px;height:620px;margin:auto;background:linear-gradient(135deg,#1C1C1C 0%,#111 100%);border:3px solid #F5C518;border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;box-sizing:border-box}.logo{color:#F5C518;font-size:28px;font-weight:900;margin-bottom:20px}.title{color:#F5C518;font-size:16px;letter-spacing:4px;text-transform:uppercase;margin-bottom:30px}.name{color:#fff;font-size:44px;font-weight:900;margin-bottom:20px}.course{color:#999;font-size:14px;margin-bottom:8px}.course-name{color:#fff;font-size:22px;font-weight:700;margin-bottom:30px}.meta{color:#666;font-size:12px;margin-top:20px;border-top:1px solid #2A2A2A;padding-top:15px;width:100%}.cert-no{color:#F5C518;font-size:11px}</style>
</head>
<body><div class="cert">
<div class="logo">🐛 CodeBettle</div>
<div class="title">Certificate of Completion</div>
<p style="color:#999;font-size:14px;margin-bottom:10px">This is to certify that</p>
<div class="name">${studentName}</div>
<div class="course">has successfully completed</div>
<div class="course-name">${courseName}</div>
<p style="color:#999;font-size:13px">Issued on ${issuedDate}</p>
<div class="meta"><div class="cert-no">Certificate No: ${certNumber}</div></div>
</div></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `CodeBettle-Certificate-${certNumber}.html`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('Certificate downloaded!');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">My Certificates</h1>
        <p className="text-muted text-sm mt-1">{items.length} certificate{items.length !== 1 ? 's' : ''} earned</p>
      </div>

      {items.length === 0 ? (
        <Card className="py-16 text-center">
          <Award className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-white font-semibold mb-2">No certificates yet</p>
          <p className="text-muted text-sm">Complete a course to earn your first certificate.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map(({ cert, course }) => (
            <div key={cert.id} className="bg-gradient-to-br from-dark-card to-surface border border-primary/30 rounded-xl p-6 hover:border-primary/60 transition-all hover:shadow-[0_0_20px_rgba(245,197,24,0.1)]">
              <div className="text-center mb-4">
                <Award className="w-12 h-12 text-primary mx-auto mb-3" />
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-1">Certificate of Completion</p>
                <p className="text-muted text-xs mb-2">{studentName}</p>
                <h3 className="text-white font-bold text-sm leading-snug">{course!.title}</h3>
              </div>
              <div className="text-center text-xs text-muted mb-4">
                <p>Issued: {formatDate(cert.issuedAt)}</p>
                <p className="text-primary font-mono mt-1">{cert.certificateNumber}</p>
              </div>
              <Button
                fullWidth
                size="sm"
                variant="outline"
                onClick={() => handleDownload(cert.certificateNumber, course!.title, studentName, formatDate(cert.issuedAt))}
              >
                <Download className="w-3.5 h-3.5" /> Download
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
