'use client';
import Navbar from '@/components/layout/Navbar';
import Footer, { useSiteSettings } from '@/components/layout/Footer';
import FadeIn from '@/components/ui/FadeIn';
import PublicPageBackdrop from '@/components/ui/PublicPageBackdrop';
import PageAccentScene from '@/components/ui/PageAccentScene';
import SectionDepth from '@/components/ui/SectionDepth';
import TiltCard from '@/components/ui/TiltCard';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { Mail, Phone, MapPin, Send } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { CONTACT_ADDRESS, CONTACT_EMAIL, CONTACT_PHONE } from '@/lib/social';

export default function ContactPage() {
  // Settings fix: contact details come from the admin-managed site
  // settings (provided by the root layout, see
  // components/layout/Footer.tsx), falling back to the verified
  // lib/social.ts constants — identical to today until an admin
  // saves a value. NOTE: the fallback phone is the verified
  // +92 305 5261893, replacing the old '+92 300 1234567'
  // placeholder that was hardcoded here.
  const settings = useSiteSettings();
  const contactEmail = settings?.contactEmail ?? CONTACT_EMAIL;
  const contactPhone = settings?.phone ?? CONTACT_PHONE;
  const contactAddress = settings?.address ?? CONTACT_ADDRESS;

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        toast.error('Too many messages — please try again in a few minutes.');
        return;
      }
      if (!res.ok) {
        toast.error(data.error || 'Could not send your message — please try again.');
        return;
      }
      toast.success('Message sent! We will get back to you within 24 hours.');
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      toast.error('Could not send your message — please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16">
        <div className="relative py-16 bg-dark-card border-b border-dark-border text-center overflow-hidden">
          {/* Shared public-page backdrop (Step 2): static grid + glows,
              plus a slow gold particle field on desktop/WebGL. */}
          <PublicPageBackdrop variant="hero" />
          <div aria-hidden="true" className="absolute top-8 left-[12%] w-20 h-20 rounded-full bg-primary/10 blur-2xl pointer-events-none animate-float-slow hidden md:block" />
          <div aria-hidden="true" className="absolute bottom-6 right-[10%] w-24 h-24 rounded-full bg-primary/[0.07] blur-2xl pointer-events-none animate-float-slower hidden md:block" />
          {/* Step 3: floating gold shapes at the left edge — the
              same world as the Home hero scene, at a whisper. */}
          <PageAccentScene layout="left" />
          <FadeIn className="relative max-w-xl mx-auto px-4">
            <span className="text-primary-text text-sm font-semibold uppercase tracking-wider">Contact Us</span>
            <h1 className="text-4xl font-black text-foreground mt-2 mb-3">Get in <span className="gradient-text">Touch</span></h1>
            <p className="text-muted">Have questions? We're here to help. Send us a message and we'll respond within 24 hours.</p>
          </FadeIn>
        </div>

        {/* Step 3: the form area sits on the shared gold particle/grid
            backdrop — the form itself stays static (no tilt while
            typing); only the info column beside it gets depth. */}
        <div className="relative overflow-hidden">
          <PublicPageBackdrop variant="hero" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid lg:grid-cols-5 gap-12">
            <SectionDepth className="lg:col-span-2">
            <FadeIn className="space-y-6">
              <h2 className="text-xl font-bold text-foreground">Contact Information</h2>
              {[
                { icon: <Mail className="w-5 h-5" />, label: 'Email', value: contactEmail },
                { icon: <Phone className="w-5 h-5" />, label: 'Phone', value: contactPhone },
                { icon: <MapPin className="w-5 h-5" />, label: 'Address', value: contactAddress },
              ].map((item, i) => (
                <FadeIn key={item.label} delay={i * 0.08}>
                  <TiltCard max={5}>
                    <div className="flex items-start gap-4 rounded-xl border border-dark-border bg-dark-card p-4 hover:border-primary/30 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)] transition-all duration-300">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary-text flex items-center justify-center flex-shrink-0 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.6)]">{item.icon}</div>
                      <div>
                        <p className="text-foreground font-medium text-sm">{item.label}</p>
                        <p className="text-muted text-sm">{item.value}</p>
                      </div>
                    </div>
                  </TiltCard>
                </FadeIn>
              ))}
            </FadeIn>
            </SectionDepth>

            <FadeIn delay={0.1} className="lg:col-span-3">
              {/* Gold gradient frame + deep shadow: the form reads as a
                  raised glass panel. No mouse tilt here — tilting a
                  form while typing would hurt usability. */}
              <div className="rounded-xl bg-gradient-to-b from-primary/40 via-dark-border to-dark-border p-px shadow-[0_16px_48px_-16px_rgba(0,0,0,0.7)]">
              <form onSubmit={handleSubmit} className="bg-dark-card rounded-[11px] p-6 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input label="Your Name" placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                  <Input label="Email Address" type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                </div>
                <Input label="Subject" placeholder="How can we help?" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} required />
                <Textarea label="Message" placeholder="Tell us more..." value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={5} required />
                <Button type="submit" size="lg" loading={loading} className="gap-2 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgba(245,197,24,0.5)] transition-all">
                  <Send className="w-4 h-4" /> Send Message
                </Button>
              </form>
              </div>
            </FadeIn>
          </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
