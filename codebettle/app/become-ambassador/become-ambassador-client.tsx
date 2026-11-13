'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { Users } from 'lucide-react';

/**
 * Ambassador application form (PR #33). EXACT fields from Eman's
 * Google Form 'CodeBettle Ambassador' (13 Nov 2026 ~22:19 PKT) — all
 * 8 required: Name, WhatsApp, Email, University / Institute Name,
 * Department & Semester (ONE field), leadership position (radio),
 * promotion plan (long text), prior ambassador experience (Yes/No).
 * On submit the application is saved (POST /api/become-ambassador)
 * and a confirmation replaces the form.
 */
const LEADERSHIP_OPTIONS = [
  'Class Representative (CR)',
  'Girls Representative (GR)',
  'Society Executive',
  'None / General Student',
] as const;

export default function AmbassadorForm() {
  const [form, setForm] = useState({
    fullName: '',
    whatsapp: '',
    email: '',
    university: '',
    departmentSemester: '',
    leadershipPosition: '',
    promotionPlan: '',
    priorAmbassadorExperience: '',
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
      const res = await fetch('/api/become-ambassador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not save your application. Please try again.');
        return;
      }
      setDone(true);
    } catch {
      setError('Could not save your application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="bg-dark-card border border-dark-border rounded-xl p-8 text-center" role="status">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center mb-4">
          <Users className="w-8 h-8 text-primary-text" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Application received.</h2>
        <p className="text-muted text-sm leading-relaxed">
          Thank you, {form.fullName.split(' ')[0] || 'friend'}. Your ambassador application is saved and our team will
          review it and get back to you.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-dark-card border border-dark-border rounded-xl p-6 space-y-4">
      <Input
        label="Name *"
        value={form.fullName}
        onChange={(e) => set('fullName', e.target.value)}
        required
        maxLength={100}
        placeholder="Your full name"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="WhatsApp *"
          type="tel"
          value={form.whatsapp}
          onChange={(e) => set('whatsapp', e.target.value)}
          required
          maxLength={30}
          placeholder="+92 ..."
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
      <Input
        label="University / Institute Name *"
        value={form.university}
        onChange={(e) => set('university', e.target.value)}
        required
        maxLength={200}
        placeholder="Your university or institute"
      />
      <Input
        label="Department & Semester *"
        value={form.departmentSemester}
        onChange={(e) => set('departmentSemester', e.target.value)}
        required
        maxLength={200}
        placeholder="e.g. Computer Science, 5th Semester"
      />
      <fieldset>
        <legend className="text-sm font-medium text-foreground/80 mb-2">
          Do you hold any leadership position? *
        </legend>
        <div className="space-y-2">
          {LEADERSHIP_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2.5 rounded-lg border border-dark-border bg-background px-3 py-2 text-sm text-foreground cursor-pointer hover:border-primary/50 transition-colors"
            >
              <input
                type="radio"
                name="leadershipPosition"
                value={option}
                checked={form.leadershipPosition === option}
                onChange={(e) => set('leadershipPosition', e.target.value)}
                required
                className="accent-primary w-4 h-4"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
      <Textarea
        label="How do you plan to promote CodeBettle courses on your campus? *"
        value={form.promotionPlan}
        onChange={(e) => set('promotionPlan', e.target.value)}
        required
        maxLength={5000}
        rows={4}
        placeholder="Tell us how you would spread the word on your campus…"
      />
      <fieldset>
        <legend className="text-sm font-medium text-foreground/80 mb-2">
          Have you done campus ambassador work before? *
        </legend>
        <div className="flex gap-2">
          {(['Yes', 'No'] as const).map((option) => (
            <label
              key={option}
              className="flex items-center gap-2.5 rounded-lg border border-dark-border bg-background px-4 py-2 text-sm text-foreground cursor-pointer hover:border-primary/50 transition-colors"
            >
              <input
                type="radio"
                name="priorAmbassadorExperience"
                value={option}
                checked={form.priorAmbassadorExperience === option}
                onChange={(e) => set('priorAmbassadorExperience', e.target.value)}
                required
                className="accent-primary w-4 h-4"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" loading={submitting} fullWidth>
        Submit application
      </Button>
    </form>
  );
}
