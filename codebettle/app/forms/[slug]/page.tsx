import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { headers } from 'next/headers';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FadeIn from '@/components/ui/FadeIn';
import PublicFormClient from './form-client';
import type { PublicForm } from '@/lib/public-form';

/**
 * Public form page (Phase 6, Worker C) — /forms/[slug].
 * Server wrapper: fetches the published form through the public API
 * (GET /api/forms/[slug], owned by Worker A) and hands it to the client
 * form. Unknown slugs and draft/unpublished forms 404 — a draft is never
 * rendered publicly; the API only ever returns published forms.
 * `await connection()` opts out of build-time prerendering (public page,
 * slug only known at request time, and the API route does not exist yet
 * at build time — the build must not try to fetch it).
 */

/** Absolute base URL for the self-fetch: request origin first, env fallback. */
async function getBaseUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (envUrl) return envUrl;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return 'http://localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

async function getPublishedForm(slug: string): Promise<PublicForm | null> {
  const base = await getBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${base}/api/forms/${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    });
  } catch (err) {
    throw new Error(`Could not reach the forms API for slug "${slug}"`, { cause: err });
  }
  // Unknown slug, or draft/unpublished form: the API answers 404.
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Forms API returned ${res.status} for slug "${slug}"`);
  }
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== 'object' || !('form' in data) || !data.form) return null;
  return data.form as PublicForm;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const form = await getPublishedForm(slug).catch(() => null);
  if (!form) return { title: 'Form not found | CodeBettle' };
  return {
    title: `${form.name} | CodeBettle`,
    description: form.description ?? `Fill in the ${form.name} form on CodeBettle.`,
  };
}

export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const form = await getPublishedForm(slug);
  if (!form) notFound();

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16">
        <div className="py-16 bg-dark-card border-b border-dark-border text-center">
          <FadeIn className="max-w-xl mx-auto px-4">
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">CodeBettle Form</span>
            <h1 className="text-4xl font-black text-white mt-2 mb-3">{form.name}</h1>
            {form.description && <p className="text-muted">{form.description}</p>}
          </FadeIn>
        </div>

        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <PublicFormClient form={form} slug={slug} />
        </div>
      </main>
      <Footer />
    </>
  );
}
