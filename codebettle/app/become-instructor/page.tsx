'use client';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FadeIn from '@/components/ui/FadeIn';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { useState } from 'react';
import { CheckCircle, Users, DollarSign, BookOpen, Send, Upload, FileText, Video, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { isApplicationFormValid } from '@/lib/application-form-validation';
import { cleanupUploadedApplicationFiles } from '@/lib/application-file-cleanup';

const MAX_CV_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DEMO_BYTES = 100 * 1024 * 1024; // 100 MB
const CV_EXTENSIONS = ['.pdf', '.doc', '.docx'];
const DEMO_EXTENSIONS = ['.mp4', '.webm', '.mov'];

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fileExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

const perks = [
  { icon: <Users className="w-6 h-6" />, title: 'Reach Thousands', desc: 'Share your knowledge with our growing community of motivated students.' },
  { icon: <DollarSign className="w-6 h-6" />, title: 'Earn Revenue', desc: 'Get paid for every course enrollment. Build a passive income stream.' },
  { icon: <BookOpen className="w-6 h-6" />, title: 'Full Support', desc: 'We provide tools, marketing, and support to help you succeed as an instructor.' },
];

export default function BecomeInstructorPage() {
  // Module 3: `message` ("Why do you want to teach?") stays as-is and is
  // separate from `whyGoodFit` ("Why do you think you are a good fit for
  // this role?") — the contract keeps both. `phone` is optional end to
  // end (schema/service/DB already had it; only this UI lacked it).
  const [form, setForm] = useState({ name: '', email: '', phone: '', expertise: '', experience: '', message: '', additionalInfo: '', whyGoodFit: '', linkedinUrl: '', githubUrl: '' });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [demoFile, setDemoFile] = useState<File | null>(null);
  const [cvError, setCvError] = useState('');
  const [demoError, setDemoError] = useState('');
  const [uploading, setUploading] = useState<'cv' | 'demo' | null>(null);

  // Module 3: Submit stays disabled until every required field
  // validates — including both files present with no file errors.
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
    // The button is disabled until valid, but guard a keyboard/programmatic
    // submit too — never POST an incomplete application.
    if (!isValid) return;
    setLoading(true);
    setSubmitError('');
    // Module 3 orphan cleanup: every path uploaded in this submit is
    // tracked here; any failure after an upload deletes what landed.
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
        // The CV already uploaded — delete it so it does not sit orphaned.
        await cleanupUploadedApplicationFiles(uploadedPaths);
        setSubmitError(err instanceof Error ? err.message : 'Demo recording upload failed. Please try again.');
        return;
      }
      const res = await fetch('/api/admin/applications', {
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
          linkedinUrl: form.linkedinUrl.trim(),
          ...(form.githubUrl.trim() ? { githubUrl: form.githubUrl.trim() } : {}),
          ...(cvUrl ? { cvUrl } : {}),
          ...(demoRecordingUrl ? { demoRecordingUrl } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Final POST failed after uploads succeeded — delete the orphans.
        await cleanupUploadedApplicationFiles(uploadedPaths);
        setSubmitError(data.error || 'Could not submit your application. Please try again.');
        return;
      }
      setSubmitted(true);
      toast.success('Application submitted! We will review and contact you within 3-5 business days.');
    } catch {
      await cleanupUploadedApplicationFiles(uploadedPaths);
      setSubmitError('Could not submit your application. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16">
        <div className="py-20 bg-dark-card border-b border-dark-border text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5" />
          <div className="relative max-w-2xl mx-auto px-4">
            <FadeIn>
            <span className="text-primary-text text-sm font-semibold uppercase tracking-wider">Become an Instructor</span>
            <h1 className="text-4xl sm:text-5xl font-black text-foreground mt-2 mb-4">
              Share Your <span className="gradient-text">Expertise</span>
            </h1>
            <p className="text-muted text-lg">Join our team of expert instructors and impact thousands of students' careers across Pakistan.</p>
            </FadeIn>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            {perks.map((perk, i) => (
              <FadeIn key={perk.title} delay={i * 0.08} className="bg-dark-card border border-dark-border rounded-xl p-6 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 text-primary-text mb-4">{perk.icon}</div>
                <h3 className="text-foreground font-bold mb-2">{perk.title}</h3>
                <p className="text-muted text-sm">{perk.desc}</p>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={0.1} className="max-w-2xl mx-auto">
            {submitted ? (
              <div className="bg-dark-card border border-green-500/30 rounded-xl p-10 text-center">
                <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-foreground mb-2">Application Submitted!</h2>
                <p className="text-muted">Thank you for applying. Our team will review your application and reach out within 3-5 business days.</p>
              </div>
            ) : (
              <div className="bg-dark-card border border-dark-border rounded-xl p-8">
                <h2 className="text-xl font-bold text-foreground mb-6">Apply to Become an Instructor</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input label="Full Name" placeholder="Your name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                    <Input label="Email" type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                  </div>
                  <Input label="Area of Expertise" placeholder="e.g., React, Python, UI/UX Design" value={form.expertise} onChange={e => setForm(f => ({ ...f, expertise: e.target.value }))} required />
                  <Input label="Years of Experience" placeholder="e.g., 5 years as a full-stack developer" value={form.experience} onChange={e => setForm(f => ({ ...f, experience: e.target.value }))} required />
                  <Input label="Phone (optional)" type="tel" placeholder="+92 300 1234567" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                  <Textarea label="Why do you want to teach?" placeholder="Tell us about yourself and your teaching goals..." value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={4} required />
                  <Textarea label="Why do you think you are a good fit for this role?" placeholder="What makes you a good fit to teach at CodeBettle?..." value={form.whyGoodFit} onChange={e => setForm(f => ({ ...f, whyGoodFit: e.target.value }))} rows={4} required />
                  <Textarea label="Anything Additional You Have (optional)" placeholder="Anything else you'd like us to know — other skills, availability, links..." value={form.additionalInfo} onChange={e => setForm(f => ({ ...f, additionalInfo: e.target.value }))} rows={3} />
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input label="LinkedIn Profile" type="url" placeholder="https://linkedin.com/in/your-name" value={form.linkedinUrl} onChange={e => setForm(f => ({ ...f, linkedinUrl: e.target.value }))} required />
                    <Input label="GitHub Profile (optional)" type="url" placeholder="https://github.com/your-name" value={form.githubUrl} onChange={e => setForm(f => ({ ...f, githubUrl: e.target.value }))} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground/80">Upload CV *</label>
                      <label className="flex items-center gap-3 bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground cursor-pointer hover:border-primary/50 transition-colors">
                        <FileText className="w-4 h-4 text-primary-text shrink-0" />
                        {cvFile ? (
                          <span className="flex-1 truncate">{cvFile.name} <span className="text-muted">({formatFileSize(cvFile.size)})</span></span>
                        ) : (
                          <span className="flex-1 text-muted">PDF, DOC or DOCX · up to 5 MB</span>
                        )}
                        {uploading === 'cv' ? (
                          <span className="text-primary-text text-xs shrink-0">Uploading…</span>
                        ) : cvFile ? (
                          <button type="button" aria-label="Remove CV" onClick={ev => { ev.preventDefault(); setCvFile(null); }} className="text-muted hover:text-foreground shrink-0 cursor-pointer"><X className="w-4 h-4" /></button>
                        ) : (
                          <Upload className="w-4 h-4 text-muted shrink-0" />
                        )}
                        <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => { pickCv(e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                      {cvError && <p className="text-xs text-red-400">{cvError}</p>}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground/80">Demo Lecture Recording *</label>
                      <label className="flex items-center gap-3 bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground cursor-pointer hover:border-primary/50 transition-colors">
                        <Video className="w-4 h-4 text-primary-text shrink-0" />
                        {demoFile ? (
                          <span className="flex-1 truncate">{demoFile.name} <span className="text-muted">({formatFileSize(demoFile.size)})</span></span>
                        ) : (
                          <span className="flex-1 text-muted">MP4, WebM or MOV · up to 100 MB</span>
                        )}
                        {uploading === 'demo' ? (
                          <span className="text-primary-text text-xs shrink-0">Uploading…</span>
                        ) : demoFile ? (
                          <button type="button" aria-label="Remove demo recording" onClick={ev => { ev.preventDefault(); setDemoFile(null); }} className="text-muted hover:text-foreground shrink-0 cursor-pointer"><X className="w-4 h-4" /></button>
                        ) : (
                          <Upload className="w-4 h-4 text-muted shrink-0" />
                        )}
                        <input type="file" accept=".mp4,.webm,.mov" className="hidden" onChange={e => { pickDemo(e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                      {demoError && <p className="text-xs text-red-400">{demoError}</p>}
                    </div>
                  </div>
                  {submitError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">{submitError}</div>
                  )}
                  <Button type="submit" size="lg" loading={loading} disabled={!isValid} fullWidth><Send className="w-4 h-4" />Submit Application</Button>
                  {!isValid && (
                    <p className="text-xs text-muted text-center">Fill in all required fields — including your LinkedIn profile, CV and demo recording — to submit.</p>
                  )}
                </form>
              </div>
            )}
          </FadeIn>
        </div>
      </main>
      <Footer />
    </>
  );
}
