/**
 * Certificate PDF rendering (Phase 2) — headless Chromium.
 *
 * The PDF is rendered from the chosen HTML template (per-course, or
 * the default Python design) with puppeteer-core + @sparticuz/chromium
 * — the standard Vercel serverless Chromium pattern. The Chromium
 * binary ships inside the @sparticuz/chromium npm package and is
 * extracted to /tmp on first use (chromium.executablePath()); no
 * separate download, no system Chrome needed.
 *
 * The template is a fixed 1122x796 CSS px page (A4 landscape at
 * 96dpi). A4 landscape is 793.7 CSS px tall, so the 796px design
 * overflows the page by ~2px — without correction Chromium would
 * paginate onto a blank second page. The render therefore measures
 * the content height and scales to fit one page (scale <= 1, ~0.997
 * for the default template — a 0.3% shrink, invisible). A certificate
 * is a single page by definition, so shrinking to fit is always
 * right; content is never upscaled.
 *
 * The PDF is generated on demand and returned as bytes — never stored
 * on disk, never served as HTML. All fonts/images in the default
 * template are embedded data URIs, so rendering needs no network.
 * (A per-course template may reference its course thumbnail, which
 * is embedded as a data URI before this point — see template.ts.)
 *
 * VERCEL NOTES (certificate PDF fix, 13 Nov 2026): two things the
 * download route needs on Vercel that local development does not.
 * 1. BUNDLING — Next's file tracer cannot see the Chromium binary:
 *    @sparticuz/chromium reads its .br archives off disk at request
 *    time through a dynamically computed path, so the tracer packs
 *    the function WITHOUT the binary and the route throws at launch.
 *    The fix is explicit: next.config.ts lists the package in
 *    `serverExternalPackages` (so the bundler does not relocate it)
 *    and `outputFileTracingIncludes` for the download route
 *    (so the bin/ archives are traced into the function bundle).
 * 2. TIMEOUT — a cold start extracts ~70 MB of .br archives to /tmp,
 *    launches Chromium, then renders; that easily exceeds Vercel's
 *    Hobby 10s default. The download route sets
 *    `export const maxDuration = 60` (the Hobby maximum).
 */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

/** A4 landscape height in CSS px at 96dpi (210mm). */
const A4_LANDSCAPE_HEIGHT_PX = 793.7;

/**
 * Which step of the render failed. The route logs this (server-side
 * only) so the cause can be read from the Vercel dashboard without
 * leaking internals to the student.
 * - 'binary': the Chromium binary could not be found or extracted
 *   (executablePath) — the bundle is missing the .br archives.
 * - 'launch': the browser process would not start.
 * - 'content': the page could not be built from the HTML.
 * - 'pdf': the PDF itself could not be produced.
 * - 'unknown': anything else (a non-render error reaching the route).
 */
export type CertificateRenderStage = 'binary' | 'launch' | 'content' | 'pdf' | 'unknown';

/** The user-facing message for a render failure (generic, no internals). */
export const CERTIFICATE_PDF_ERROR_MESSAGE =
  'Could not generate the certificate PDF. Please try again.';
/**
 * The user-facing message when the Chromium binary itself is missing
 * (stage 'binary'). Distinct from the generic message so the student
 * — and the support trail — can tell "the service is down" apart
 * from "this render failed".
 */
export const CERTIFICATE_SERVICE_UNAVAILABLE_MESSAGE =
  'The certificate service is temporarily unavailable. Please try again later.';

/**
 * A render failure with the stage attached. The route uses
 * classifyRenderError to turn any thrown value into a log line and a
 * user-facing message; it only has to special-case this class.
 */
export class CertificateRenderError extends Error {
  readonly stage: CertificateRenderStage;
  constructor(stage: Exclude<CertificateRenderStage, 'unknown'>, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CertificateRenderError';
    this.stage = stage;
  }
}

/**
 * Map any render failure to the stage + user-facing message the route
 * needs. A CertificateRenderError keeps its stage; anything else is
 * 'unknown' with the generic message. No error text, token, id or
 * internal path is ever put in the user-facing message.
 */
export function classifyRenderError(error: unknown): {
  stage: CertificateRenderStage;
  userMessage: string;
} {
  if (error instanceof CertificateRenderError) {
    return {
      stage: error.stage,
      userMessage:
        error.stage === 'binary'
          ? CERTIFICATE_SERVICE_UNAVAILABLE_MESSAGE
          : CERTIFICATE_PDF_ERROR_MESSAGE,
    };
  }
  return { stage: 'unknown', userMessage: CERTIFICATE_PDF_ERROR_MESSAGE };
}

export async function renderCertificatePdf(html: string): Promise<Buffer> {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  let executablePath: string;
  try {
    executablePath = await chromium.executablePath();
  } catch (error) {
    throw new CertificateRenderError(
      'binary',
      'Chromium binary could not be found or extracted',
      { cause: error },
    );
  }
  try {
    try {
      browser = await puppeteer.launch({
        args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
        defaultViewport: { width: 1122, height: 796 },
        executablePath,
        headless: 'shell',
      });
    } catch (error) {
      throw new CertificateRenderError('launch', 'Chromium browser failed to launch', {
        cause: error,
      });
    }
    let page: Awaited<ReturnType<NonNullable<typeof browser>['newPage']>>;
    let contentHeight: number;
    try {
      page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      // Fit the single-page design onto one A4 landscape page (see header).
      contentHeight = await page.evaluate(() => document.body.scrollHeight);
    } catch (error) {
      throw new CertificateRenderError('content', 'Certificate page could not be built from the HTML', {
        cause: error,
      });
    }
    try {
      const scale = Math.min(1, A4_LANDSCAPE_HEIGHT_PX / contentHeight);
      const pdf = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
        preferCSSPageSize: true,
        scale,
      });
      return Buffer.from(pdf);
    } catch (error) {
      throw new CertificateRenderError('pdf', 'Certificate PDF could not be produced', {
        cause: error,
      });
    }
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
