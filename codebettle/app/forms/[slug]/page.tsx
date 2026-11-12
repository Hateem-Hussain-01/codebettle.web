import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FadeIn from '@/components/ui/FadeIn';
import PublicFormClient from './form-client';
import type { PublicForm } from '@/lib/public-form';
import { getSession } from '@/lib/auth';
import { getFormDefinitionBySlug } from '@/lib/db/forms';
import { getPublishedFormBySlugService, toPublicForm } from '@/lib/services/form-service';
import { decideFormRender, isEmbedRequest } from '@/lib/form-access';
import { formMaxWidthPx, resolveFormStyle } from '@/lib/form-style';

/**
 * Public form page (Phase 6, Worker C) — /forms/[slug].
 * Server wrapper: fetches the published form through the public API
 * (GET /api/forms/[slug], owned by Worker A) and hands it to the client
 * form. Unknown slugs and draft/unpublished forms 404 — a draft is never
 * rendered publicly; the API only ever returns published forms.
 * `await connection()` opts out of build-time prerendering (public page,
 * slug only known at request time, and the API route does not exist yet
 * at build time — the build must not try to fetch it).
 *
 * GHL upgrade (Worker B) — two extra render modes, both driven by the
 * query string:
 * - `?preview=1` (admin only): renders ANY form — draft or published —
 *   through the admin DB read, so the admin sees exactly what
 *   submitters will see. A non-admin/anonymous request with
 *   `?preview=1` 404s exactly like an unknown slug (the draft's
 *   existence is never leaked). The preview renders the normal public
 *   page, with its style + cover.
 * - `?embed=1` (public, published only): the form STANDALONE — no
 *   Navbar, no Footer, no hero chrome — for embedding on other sites.
 *   Framing is allowed for this render only (proxy.ts + lib/security.ts).
 */

/**
 * Resolve the form for this request. Preview (admin) reads the
 * definition straight from the DB regardless of status; every other
 * request goes through the published-only service. Returns null when
 * the request must 404 — including an anonymous preview attempt,
 * which is indistinguishable from an unknown slug by design.
 */
async function getFormForRequest(
  slug: string,
  searchParams: { preview?: string | string[]; embed?: string | string[] },
): Promise<PublicForm | null> {
  const decision = decideFormRender(searchParams, await getSession());
  if (decision.render === 'not-found') return null;
  if (decision.render === 'any-status') {
    // Admin preview: any status renders. Read via the admin DB path,
    // NOT the public published-only API — a draft must be previewable.
    const form = await getFormDefinitionBySlug(slug);
    if (!form) return null;
    return toPublicForm(form);
  }
  // Published-only (normal + embed): reuse the public service rule.
  const result = await getPublishedFormBySlugService(slug);
  if ('error' in result) return null;
  return result.form;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ preview?: string | string[]; embed?: string | string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const form = await getFormForRequest(slug, sp).catch(() => null);
  if (!form) return { title: 'Form not found | CodeBettle' };
  return {
    title: `${form.name} | CodeBettle`,
    description: form.description ?? `Fill in the ${form.name} form on CodeBettle.`,
  };
}

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ preview?: string | string[]; embed?: string | string[] }>;
}) {
  await connection();
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const form = await getFormForRequest(slug, sp);
  if (!form) notFound();

  const style = resolveFormStyle(form.schema.style);
  const maxWidth = formMaxWidthPx(style.formWidth);

  // Embed render: standalone form only — no Navbar, no Footer, no
  // hero chrome. The form's own style + cover still apply (they live
  // in PublicFormClient), and the width follows the form's formWidth.
  if (isEmbedRequest(sp)) {
    return (
      <main className="min-h-screen bg-background py-6">
        <div className="mx-auto px-4 sm:px-6" style={{ maxWidth }}>
          <PublicFormClient form={form} slug={slug} />
        </div>
      </main>
    );
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16">
        <div className="py-16 bg-dark-card border-b border-dark-border text-center">
          <FadeIn className="max-w-xl mx-auto px-4">
            <span className="text-primary-text text-sm font-semibold uppercase tracking-wider">CodeBettle Form</span>
            <h1 className="text-4xl font-black text-foreground mt-2 mb-3">{form.name}</h1>
            {form.description && <p className="text-muted">{form.description}</p>}
          </FadeIn>
        </div>

        <div className="mx-auto px-4 sm:px-6 lg:px-8 py-16" style={{ maxWidth }}>
          <PublicFormClient form={form} slug={slug} />
        </div>
      </main>
      <Footer />
    </>
  );
}
