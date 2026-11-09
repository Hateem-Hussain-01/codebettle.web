'use client';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { useState } from 'react';
import { CheckCircle, Users, DollarSign, BookOpen, Send } from 'lucide-react';
import toast from 'react-hot-toast';

const perks = [
  { icon: <Users className="w-6 h-6" />, title: 'Reach Thousands', desc: 'Share your knowledge with our growing community of motivated students.' },
  { icon: <DollarSign className="w-6 h-6" />, title: 'Earn Revenue', desc: 'Get paid for every course enrollment. Build a passive income stream.' },
  { icon: <BookOpen className="w-6 h-6" />, title: 'Full Support', desc: 'We provide tools, marketing, and support to help you succeed as an instructor.' },
];

export default function BecomeInstructorPage() {
  const [form, setForm] = useState({ name: '', email: '', expertise: '', experience: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/admin/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          expertise: form.expertise.trim(),
          experience: form.experience.trim(),
          message: form.message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data.error || 'Could not submit your application. Please try again.'); return; }
      setSubmitted(true);
      toast.success('Application submitted! We will review and contact you within 3-5 business days.');
    } catch {
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
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">Become an Instructor</span>
            <h1 className="text-4xl sm:text-5xl font-black text-white mt-2 mb-4">
              Share Your <span className="gradient-text">Expertise</span>
            </h1>
            <p className="text-muted text-lg">Join our team of expert instructors and impact thousands of students' careers across Pakistan.</p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            {perks.map(perk => (
              <div key={perk.title} className="bg-dark-card border border-dark-border rounded-xl p-6 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 text-primary mb-4">{perk.icon}</div>
                <h3 className="text-white font-bold mb-2">{perk.title}</h3>
                <p className="text-muted text-sm">{perk.desc}</p>
              </div>
            ))}
          </div>

          <div className="max-w-2xl mx-auto">
            {submitted ? (
              <div className="bg-dark-card border border-green-500/30 rounded-xl p-10 text-center">
                <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">Application Submitted!</h2>
                <p className="text-muted">Thank you for applying. Our team will review your application and reach out within 3-5 business days.</p>
              </div>
            ) : (
              <div className="bg-dark-card border border-dark-border rounded-xl p-8">
                <h2 className="text-xl font-bold text-white mb-6">Apply to Become an Instructor</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input label="Full Name" placeholder="Your name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                    <Input label="Email" type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                  </div>
                  <Input label="Area of Expertise" placeholder="e.g., React, Python, UI/UX Design" value={form.expertise} onChange={e => setForm(f => ({ ...f, expertise: e.target.value }))} required />
                  <Input label="Years of Experience" placeholder="e.g., 5 years as a full-stack developer" value={form.experience} onChange={e => setForm(f => ({ ...f, experience: e.target.value }))} required />
                  <Textarea label="Why do you want to teach?" placeholder="Tell us about yourself and your teaching goals..." value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={4} required />
                  {submitError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">{submitError}</div>
                  )}
                  <Button type="submit" size="lg" loading={loading} fullWidth><Send className="w-4 h-4" />Submit Application</Button>
                </form>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
