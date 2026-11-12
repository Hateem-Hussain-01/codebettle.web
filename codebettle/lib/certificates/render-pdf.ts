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
 */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

/** A4 landscape height in CSS px at 96dpi (210mm). */
const A4_LANDSCAPE_HEIGHT_PX = 793.7;

export async function renderCertificatePdf(html: string): Promise<Buffer> {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
      defaultViewport: { width: 1122, height: 796 },
      executablePath: await chromium.executablePath(),
      headless: 'shell',
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    // Fit the single-page design onto one A4 landscape page (see header).
    const contentHeight = await page.evaluate(() => document.body.scrollHeight);
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
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
