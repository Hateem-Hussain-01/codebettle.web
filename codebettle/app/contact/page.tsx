'use client';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { Mail, Phone, MapPin, Send } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function ContactPage() {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    toast.success('Message sent! We will get back to you within 24 hours.');
    setForm({ name: '', email: '', subject: '', message: '' });
    setLoading(false);
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16">
        <div className="py-16 bg-dark-card border-b border-dark-border text-center">
          <div className="max-w-xl mx-auto px-4">
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">Contact Us</span>
            <h1 className="text-4xl font-black text-white mt-2 mb-3">Get in <span className="gradient-text">Touch</span></h1>
            <p className="text-muted">Have questions? We're here to help. Send us a message and we'll respond within 24 hours.</p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid lg:grid-cols-5 gap-12">
            <div className="lg:col-span-2 space-y-6">
              <h2 className="text-xl font-bold text-white">Contact Information</h2>
              {[
                { icon: <Mail className="w-5 h-5" />, label: 'Email', value: 'info@codebettle.com' },
                { icon: <Phone className="w-5 h-5" />, label: 'Phone', value: '+92 300 1234567' },
                { icon: <MapPin className="w-5 h-5" />, label: 'Address', value: 'Lahore, Punjab, Pakistan' },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">{item.icon}</div>
                  <div>
                    <p className="text-white font-medium text-sm">{item.label}</p>
                    <p className="text-muted text-sm">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="lg:col-span-3">
              <form onSubmit={handleSubmit} className="bg-dark-card border border-dark-border rounded-xl p-6 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input label="Your Name" placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                  <Input label="Email Address" type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                </div>
                <Input label="Subject" placeholder="How can we help?" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} required />
                <Textarea label="Message" placeholder="Tell us more..." value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={5} required />
                <Button type="submit" size="lg" loading={loading} className="gap-2">
                  <Send className="w-4 h-4" /> Send Message
                </Button>
              </form>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
