'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import { CheckCircle2, Send, AlertTriangle } from 'lucide-react';
import { PublicFormFields } from './form-fields';
import {
  formButtonBorderRadius,
  formButtonTextColor,
  formFontFamily,
  isValidCoverImageUrl,
  resolveFormStyle,
} from '@/lib/form-style';
import {
  emptyFormData,
  getSubmitButtonText,
  getSuccessMessage,
  interpretSubmitResponse,
  prepareSubmitData,
  validateFormData,
  type PublicForm,
} from '@/lib/public-form';

type Banner =
  | { kind: 'rate-limited' }
  | { kind: 'network' }
  | { kind: 'error'; message: string };

const BANNER_TEXT: Record<Banner['kind'], string> = {
  'rate-limited': 'Too many submissions — please try again later.',
  network: 'Could not submit — check your connection and try again.',
  error: 'Something went wrong — please try again.',
};

/**
 * Public form — client side (Phase 6, Worker C).
 * Renders the published form's schema, validates client-side for instant
 * feedback (the server re-validates everything), and POSTs { data } to
 * /api/forms/[slug]/submit. Works for signed-out visitors; signed-in
 * visitors submit the same way — the server records the submitter, the
 * client sends nothing about identity. Double-submit is prevented by
 * disabling the button while a submission is in flight.
 *
 * GHL upgrade — whole-form custom style (schema.style) and cover image
 * (schema.coverImageUrl) are applied here with inline styles, so a form
 * with no style set renders exactly as before (dark + gold defaults):
 * the form background / text colour / font, the submit button's colour
 * + shape, and the cover banner at the top. The cover URL is re-checked
 * here before rendering (defence in depth — the server validates it on
 * save, but a stored URL is rendered verbatim, so never trust it blind).
 */
export default function PublicFormClient({ form, slug }: { form: PublicForm; slug: string }) {
  const fields = form.schema.fields;
  const style = resolveFormStyle(form.schema.style);
  const coverUrl = isValidCoverImageUrl(form.schema.coverImageUrl)
    ? (form.schema.coverImageUrl as string)
    : undefined;
  // Inline styles beat the dark-card / primary classes below; unset
  // values stay undefined so React omits them and the defaults show.
  const formStyle: React.CSSProperties = {
    backgroundColor: style.backgroundColor,
    color: style.textColor,
    fontFamily: formFontFamily(style.font),
  };
  const submitStyle: React.CSSProperties = {
    backgroundColor: style.primaryColor,
    borderRadius: formButtonBorderRadius(style.buttonShape),
    color: style.primaryColor ? formButtonTextColor(style.primaryColor) : undefined,
  };
  const [values, setValues] = useState<Record<string, unknown>>(() => emptyFormData(fields));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (fieldId: string, value: unknown) => {
    setValues((v) => ({ ...v, [fieldId]: value }));
    setErrors((e) => {
      if (!(fieldId in e)) return e;
      const next = { ...e };
      delete next[fieldId];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const clientErrors = validateFormData(fields, values);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setBanner(null);
      return;
    }

    setErrors({});
    setBanner(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: prepareSubmitData(fields, values) }),
      });
      const body = await res.json().catch(() => ({}));
      const result = interpretSubmitResponse(res.status, body);
      if (result.outcome === 'success') {
        setValues(emptyFormData(fields));
        setSubmitted(true);
      } else if (result.outcome === 'field-errors') {
        setErrors(result.errors);
      } else if (result.outcome === 'rate-limited') {
        setBanner({ kind: 'rate-limited' });
      } else {
        setBanner({
          kind: 'error',
          message:
            typeof body?.error === 'string' && body.error
              ? body.error
              : BANNER_TEXT.error,
        });
      }
    } catch {
      setBanner({ kind: 'network' });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <FadeIn>
        <Card className="text-center border-primary/30" style={formStyle}>
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">Response submitted</h2>
          <p className="text-muted text-sm leading-relaxed">{getSuccessMessage(form)}</p>
          <div className="mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setValues(emptyFormData(fields));
                setSubmitted(false);
              }}
            >
              Submit another response
            </Button>
          </div>
        </Card>
      </FadeIn>
    );
  }

  return (
    <FadeIn>
      {coverUrl && (
        <img
          src={coverUrl}
          alt=""
          className="w-full h-44 object-cover block border border-b-0 border-dark-border rounded-t-xl"
        />
      )}
      <form
        onSubmit={handleSubmit}
        noValidate
        style={formStyle}
        // With a cover the form is the bottom half of one card: square
        // top corners, no top border (the seam would double it). Without
        // a cover it is a standalone rounded card. The two class sets
        // are mutually exclusive — never rounded-xl + rounded-b-xl
        // together, which would fight over the top corners.
        className={
          coverUrl
            ? 'bg-dark-card border border-t-0 border-dark-border rounded-b-xl p-6 space-y-5'
            : 'bg-dark-card border border-dark-border rounded-xl p-6 space-y-5'
        }
      >
        {banner && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{banner.kind === 'error' ? banner.message : BANNER_TEXT[banner.kind]}</span>
          </div>
        )}
        <PublicFormFields
          fields={fields}
          values={values}
          errors={errors}
          disabled={submitting}
          onChange={handleChange}
          textColor={style.textColor}
          accentColor={style.primaryColor}
        />
        <Button type="submit" size="lg" loading={submitting} fullWidth className="gap-2" style={submitStyle}>
          <Send className="w-4 h-4" /> {getSubmitButtonText(form)}
        </Button>
      </form>
    </FadeIn>
  );
}
