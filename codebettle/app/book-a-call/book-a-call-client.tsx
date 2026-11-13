'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { CalendarCheck } from 'lucide-react';

/**
 * Book-a-call form (PR #33). Student questions only — no budget
 * question, the call is free. Compact: name + email and phone +
 * status sit side by side so the page fits without scrolling on
 * desktop. On submit the request is saved (POST /api/book-a-call)
 * and a confirmation replaces the form.
 */
export default function BookACallForm() {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    currentStatus: '',
    courseInterest: '',
    guidanceNeeded: '',
    preferredContact: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/book-a-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not save your request. Please try again.');
        return;
      }
      setDone(true);
    } catch {
      setError('Could not save your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="bg-dark-card border border-dark-border rounded-xl p-8 text-center" role="status">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center mb-4">
          <CalendarCheck className="w-8 h-8 text-primary-text" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Your call is booked in — almost.</h2>
        <p className="text-muted text-sm leading-relaxed">
          Thank you, {form.fullName.split(' ')[0] || 'friend'}. Your request is saved and our team will reply to you
          directly to fix a time for your free career-guidance call.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-dark-card border border-dark-border rounded-xl p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Full name *"
          value={form.fullName}
          onChange={(e) => set('fullName', e.target.value)}
          required
          maxLength={100}
          placeholder="Your full name"
        />
        <Input
          label="Email *"
          type="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          required
          maxLength={200}
          placeholder="you@example.com"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Phone"
          type="tel"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          maxLength={30}
          placeholder="+92 ..."
        />
        <Select
          label="Current status *"
          value={form.currentStatus}
          onChange={(e) => set('currentStatus', e.target.value)}
          required
          options={[
            { value: '', label: 'Select…' },
            { value: 'student', label: 'Student' },
            { value: 'professional', label: 'Professional' },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Course or topic of interest"
          value={form.courseInterest}
          onChange={(e) => set('courseInterest', e.target.value)}
          maxLength={200}
          placeholder="e.g. Python, Web Development"
        />
        <Input
          label="Preferred contact time / mode"
          value={form.preferredContact}
          onChange={(e) => set('preferredContact', e.target.value)}
          maxLength={200}
          placeholder="e.g. Evenings, WhatsApp"
        />
      </div>
      <Textarea
        label="What guidance do you need? *"
        value={form.guidanceNeeded}
        onChange={(e) => set('guidanceNeeded', e.target.value)}
        required
        maxLength={2000}
        rows={3}
        placeholder="Tell us what you are stuck on or deciding between…"
      />
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" loading={submitting} fullWidth>
        Book my free call
      </Button>
    </form>
  );
}
