'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import { CheckCircle, Send, Upload, FileText, Video, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { isApplicationFormValid } from '@/lib/application-form-validation';
import { cleanupUploadedApplicationFiles } from '@/lib/application-file-cleanup';

const MAX_CV_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DEMO_BYTES = 100 * 1024 * 1024; // 100 MB
const CV_EXTENSIONS = ['.pdf', '.doc', '.docx'];
const DEMO_EXTENSIONS = ['.mp4', '.webm', '.mov'];

function fileExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Create New Application (applicant portal).
 *
 * The SAME form as the public become-instructor page (Module 3):
 * same required fields (name, email, expertise, experience, message,
 * LinkedIn, CV, demo recording, whyGoodFit), same optional fields
 * (phone, GitHub, additional info), same validation helper
 * (isApplicationFormValid), same upload endpoints and orphan cleanup.
 * Two portal differences: the email is prefilled from the signed-in
 * account and read-only (applications are filed as yourself), and
 * the submit goes to /api/applicant/applications, which enforces the
 * one-pending-application rule. A duplicate pending application gets
 * a 409 with the existing application's tracking link.
 */
export default function ApplicantNewPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', phone: '', expertise: '', experience: '', message: '', additionalInfo: '', whyGoodFit: '', linkedinUrl: '', githubUrl: '' });
  const [loading, setLoading] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [demoFile, setDemoFile] = useState<File | null>(null);
  const [cvError, setCvError] = useState('');
  const [demoError, setDemoError] = useState('');
  const [uploading, setUploading] = useState<'cv' | 'demo' | null>(null);

  // Prefill name + email from the signed-in account (email is identity here).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        setForm((f) => ({ ...f, name: data.user?.name ?? '', email: data.user?.email ?? '' }));
      } catch {
        // Prefill is a convenience — the user can still type.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isValid = isApplicationFormValid({
    name: form.name,
    email: form.email,
    expertise: form.expertise,
    experience: form.experience,
    message: form.message,
    linkedinUrl: form.linkedinUrl,
    githubUrl: form.githubUrl,
    whyGoodFit: form.whyGoodFit,
    hasCvFile: cvFile !== null,
    hasDemoFile: demoFile !== null,
    cvError,
    demoError,
  });

  const pickCv = (file: File | undefined) => {
    setCvError('');
    if (!file) return;
    if (!CV_EXTENSIONS.includes(fileExtension(file.name))) {
      setCvError('CV must be a PDF, DOC or DOCX file.');
      return;
    }
    if (file.size > MAX_CV_BYTES) {
      setCvError('CV must be 5 MB or smaller.');
      return;
    }
    setCvFile(file);
  };

  const pickDemo = (file: File | undefined) => {
    setDemoError('');
    if (!file) return;
    if (!DEMO_EXTENSIONS.includes(fileExtension(file.name))) {
      setDemoError('Demo recording must be an MP4, WebM or MOV video.');
      return;
    }
    if (file.size > MAX_DEMO_BYTES) {
      setDemoError('Demo recording must be 100 MB or smaller.');
      return;
    }
    setDemoFile(file);
  };

  const uploadFile = async (kind: 'cv' | 'demo', file: File): Promise<string> => {
    setUploading(kind);
    try {
      const data = new FormData();
      data.append('kind', kind);
      data.append('file', file);
      const res = await fetch('/api/applications/upload', { method: 'POST', body: data });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Upload failed');
      return result.path as string;
    } finally {
      setUploading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    setSubmitError('');
    const uploadedPaths: string[] = [];
    try {
      let cvUrl: string | undefined;
      let demoRecordingUrl: string | undefined;
      try {
        if (cvFile) {
          cvUrl = await uploadFile('cv', cvFile);
          uploadedPaths.push(cvUrl);
        }
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'CV upload failed. Please try again.');
        return;
      }
      try {
        if (demoFile) {
          demoRecordingUrl = await uploadFile('demo', demoFile);
          uploadedPaths.push(demoRecordingUrl);
        }
      } catch (err) {
        await cleanupUploadedApplicationFiles(uploadedPaths);
        setSubmitError(err instanceof Error ? err.message : 'Demo recording upload failed. Please try again.');
        return;
      }
      const res = await fetch('/api/applicant/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          expertise: form.expertise.trim(),
          experience: form.experience.trim(),
          message: form.message.trim(),
          ...(form.additionalInfo.trim() ? { additionalInfo: form.additionalInfo.trim() } : {}),
          whyGoodFit: form.whyGoodFit.trim(),
          ...(form.linkedinUrl.trim() ? { linkedinUrl: form.linkedinUrl.trim() } : {}),
          ...(form.githubUrl.trim() ? { githubUrl: form.githubUrl.trim() } : {}),
          ...(cvUrl ? { cvUrl } : {}),
          ...(demoRecordingUrl ? { demoRecordingUrl } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        await cleanupUploadedApplicationFiles(uploadedPaths);
        setSubmitError(data.error || 'Could not submit your application. Please try again.');
        return;
      }
      setSubmittedId(data.application.id as string);
      toast.success('Application submitted! You can track its progress here.');
    } catch {
      await cleanupUploadedApplicationFiles(uploadedPaths);
      setSubmitError('Could not submit your application. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submittedId) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Card className="text-center py-10">
          <CheckCircle className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-black text-white mb-2">Application submitted!</h1>
          <p className="text-muted text-sm mb-6">We will review it and contact you within 3–5 business days. You can track every step from here.</p>
          <Button onClick={() => router.push(`/applicant/track/${submittedId}`)}>Track My Application</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <FadeIn>
        <h1 className="text-2xl font-black text-white">New Application</h1>
        <p className="text-muted text-sm mt-1">Apply to teach at CodeBettle. Filed under your account — one application can be pending at a time.</p>
      </FadeIn>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Full name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your full name" />
            <Input label="Email *" value={form.email} disabled placeholder="Your account email" />
          </div>
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+92 ..." />
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Area of expertise *" value={form.expertise} onChange={(e) => setForm({ ...form, expertise: e.target.value })} placeholder="e.g. Web Development" />
            <Input label="Years of experience *" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} placeholder="e.g. 3 years" />
          </div>
          <Textarea label="Why do you want to teach? *" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Tell us what drives you to teach" rows={3} />
          <Textarea label="Why are you a good fit for CodeBettle? *" value={form.whyGoodFit} onChange={(e) => setForm({ ...form, whyGoodFit: e.target.value })} placeholder="Your strengths, teaching style, relevant work" rows={3} />
          <Textarea label="Anything additional" value={form.additionalInfo} onChange={(e) => setForm({ ...form, additionalInfo: e.target.value })} placeholder="Anything else we should know (optional)" rows={2} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="LinkedIn profile *" value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/..." />
            <Input label="GitHub profile" value={form.githubUrl} onChange={(e) => setForm({ ...form, githubUrl: e.target.value })} placeholder="https://github.com/..." />
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <label className="text-white text-sm font-medium block mb-2">CV *</label>
            {cvFile ? (
              <p className="text-sm text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> {cvFile.name} ({formatFileSize(cvFile.size)})
                <button type="button" onClick={() => setCvFile(null)} aria-label="Remove CV" className="text-muted hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
              </p>
            ) : (
              <label className="flex items-center gap-2 text-sm text-muted border border-dashed border-dark-border rounded-lg px-3 py-2.5 cursor-pointer hover:border-primary/50">
                <Upload className="w-4 h-4 text-primary" /> Upload your CV (PDF, DOC, DOCX — max 5 MB)
                <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => pickCv(e.target.files?.[0])} />
              </label>
            )}
            {cvError && <p className="text-red-400 text-xs mt-1">{cvError}</p>}
          </div>
          <div>
            <label className="text-white text-sm font-medium block mb-2">Demo lecture recording *</label>
            {demoFile ? (
              <p className="text-sm text-white flex items-center gap-2">
                <Video className="w-4 h-4 text-primary" /> {demoFile.name} ({formatFileSize(demoFile.size)})
                <button type="button" onClick={() => setDemoFile(null)} aria-label="Remove demo recording" className="text-muted hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
              </p>
            ) : (
              <label className="flex items-center gap-2 text-sm text-muted border border-dashed border-dark-border rounded-lg px-3 py-2.5 cursor-pointer hover:border-primary/50">
                <Upload className="w-4 h-4 text-primary" /> Upload a short demo lecture (MP4, WebM, MOV — max 100 MB)
                <input type="file" accept=".mp4,.webm,.mov" className="hidden" onChange={(e) => pickDemo(e.target.files?.[0])} />
              </label>
            )}
            {demoError && <p className="text-red-400 text-xs mt-1">{demoError}</p>}
          </div>
          {uploading && <p className="text-muted text-xs">Uploading {uploading === 'cv' ? 'CV' : 'demo recording'}…</p>}
        </Card>

        {submitError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">{submitError}</div>
        )}
        <Button type="submit" loading={loading} disabled={!isValid}>
          <Send className="w-4 h-4" /> Submit Application
        </Button>
      </form>
    </div>
  );
}
