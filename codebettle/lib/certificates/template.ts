/**
 * Per-course certificate templates (Phase 2).
 *
 * TEMPLATE SELECTION: a course may carry its own full HTML template
 * (Course.certificateTemplateHtml, attached by an admin in the course
 * form). When set and non-empty, the PDF renders THAT template; when
 * absent, the PDF falls back to the default Python design — the fixed,
 * pixel-verified template in lib/certificates/template.html, bundled
 * as lib/certificates/assets/default-template.json (a plain fs read is
 * not traced reliably into the Vercel serverless bundle, so the file
 * is imported as data; regenerate it from template.html if the design
 * ever changes — see the regen command in assets/README.md).
 * The default template is NEVER stored in the DB.
 *
 * PLACEHOLDERS (same eight in every template — see the header comment
 * in template.html): {{STUDENT_NAME}} {{COURSE_NAME}} {{COURSE_ICON}}
 * {{BATCH}} {{CERTIFICATE_NUMBER}} {{SIGNATURE_NAME}}
 * {{SIGNATURE_TITLE}} {{QR_CODE}}.
 *
 * BATCH: certificate.batch when set; otherwise "BATCH-8" for the
 * Python course (the approved design's batch for its current cohort);
 * otherwise no batch — and the batch row is HIDDEN (a
 * `.batch-row{display:none}` style is injected), never left as an
 * empty gold row.
 *
 * COURSE NAME casing: the default design prints the course in
 * capitals ("PYTHON"), so the default template gets the title
 * uppercased; a custom template gets the title as-is (its author
 * controls the casing).
 *
 * COURSE NAME batch suffix: a trailing " Batch <number>" is stripped
 * from the course title before it is printed ("Python Crash Course
 * Batch 09" -> "PYTHON CRASH COURSE") — the certificate shows the
 * course without its cohort suffix, while the website keeps the full
 * title. The batch itself ("BATCH-8") is a separate field and is
 * unaffected; resolveBatch still sees the original title.
 *
 * SIGNATURE: "Ahmad" / "CEO" — the official signatory from the
 * approved design. Do not invent a different name.
 *
 * COURSE ICON: Python course -> the Python logo (repo asset). Any
 * other course -> its thumbnail, fetched server-side and embedded as
 * a data URI when it is a usable image; otherwise a 1x1 transparent
 * PNG so the <img> never breaks.
 */
import images from './assets/images.json';
import defaultTemplate from './assets/default-template.json';
import { buildVerifyQrPng, verifyUrlForToken } from './qr';

export const DEFAULT_SIGNATURE_NAME = 'Ahmad';
export const DEFAULT_SIGNATURE_TITLE = 'CEO';
/** Approved batch for the Python course's current cohort. */
export const PYTHON_DEFAULT_BATCH = 'BATCH-8';

/** 1x1 transparent PNG — the {{COURSE_ICON}} fallback when a course has no usable image. */
export const TRANSPARENT_ICON_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=';

export const CERTIFICATE_PLACEHOLDERS = [
  '{{STUDENT_NAME}}',
  '{{COURSE_NAME}}',
  '{{COURSE_ICON}}',
  '{{BATCH}}',
  '{{CERTIFICATE_NUMBER}}',
  '{{SIGNATURE_NAME}}',
  '{{SIGNATURE_TITLE}}',
  '{{QR_CODE}}',
] as const;

export function isPythonCourse(slug: string, title: string): boolean {
  return /python/i.test(slug) || /python/i.test(title);
}

/** Which placeholders a template HTML is missing (admin warning only — never a hard failure). */
export function findMissingPlaceholders(html: string): string[] {
  return CERTIFICATE_PLACEHOLDERS.filter((p) => !html.includes(p));
}

/** The default Python design HTML (the fixed, verified template). */
export function getDefaultTemplateHtml(): string {
  return defaultTemplate.html;
}

export interface ChosenTemplate {
  html: string;
  /** True when the default Python design is used (no course template attached). */
  isDefault: boolean;
}

/** Pick the course's own template when attached, else the default design. */
export function chooseCertificateTemplate(courseTemplateHtml: string | null | undefined): ChosenTemplate {
  if (courseTemplateHtml && courseTemplateHtml.trim().length > 0) {
    return { html: courseTemplateHtml, isDefault: false };
  }
  return { html: getDefaultTemplateHtml(), isDefault: true };
}

/** Batch to print: the stored batch, else BATCH-8 for Python, else none. */
export function resolveBatch(storedBatch: string | null | undefined, slug: string, title: string): string | null {
  if (storedBatch && storedBatch.trim().length > 0) return storedBatch.trim();
  if (isPythonCourse(slug, title)) return PYTHON_DEFAULT_BATCH;
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Title-case a student name for the certificate: capitalise the first
 * letter of every word ("muhammad hateem hussain" -> "Muhammad Hateem
 * Hussain", "huffy" -> "Huffy"). Words that are already mixed-case
 * (e.g. "McDonald") are left alone so correct casing is never broken.
 * Hyphenated parts and apostrophe parts capitalise separately
 * ("mary-jane" -> "Mary-Jane", "o'brien" -> "O'Brien"). Leading/trailing
 * space is trimmed and runs of spaces collapse to one. Empty stays empty.
 * Only the student name is title-cased — never the course name, batch,
 * certificate number or signature.
 */
export function toTitleCaseName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => {
      // Already mixed-case (e.g. "McDonald") — trust the stored casing.
      if (word !== word.toLowerCase() && word !== word.toUpperCase()) return word;
      return word
        .split('-')
        .map((part) =>
          part
            .split("'")
            .map((p) => (p.length === 0 ? p : p[0].toUpperCase() + p.slice(1).toLowerCase()))
            .join("'"),
        )
        .join('-');
    })
    .join(' ');
}

/**
 * Strip a trailing " Batch <number>" suffix from a course title, for
 * the certificate only ("Python Crash Course Batch 09" ->
 * "Python Crash Course"). Case-insensitive ("Batch 09", "BATCH 08",
 * "batch 10"), trailing whitespace tolerated. Only a TRAILING suffix
 * is removed — "Batch" anywhere else in the title is left alone
 * ("Python Batch 09 Course" is unchanged). If stripping would leave
 * an empty string (the title IS the suffix, e.g. "Batch 09"), the
 * original title is returned unchanged. The website course title is
 * never touched — this is applied only when building the certificate.
 */
export function stripBatchSuffixFromCourseName(title: string): string {
  const match = /\s+batch\s+\d+\s*$/i.exec(title);
  if (!match) return title;
  const stripped = title.slice(0, match.index).trim();
  return stripped.length > 0 ? stripped : title;
}

export interface CertificateHtmlValues {
  studentName: string;
  courseName: string;
  courseIcon: string;
  batch: string | null;
  certificateNumber: string;
  signatureName: string;
  signatureTitle: string;
  qrCode: string;
}

const HIDE_BATCH_ROW_STYLE = '<style>.batch-row{display:none!important}</style>';

/**
 * Substitute all placeholders into a template. Text values are
 * HTML-escaped; courseIcon/qrCode are data URIs (no escaping — they
 * contain no HTML-special characters). When batch is null the batch
 * row is hidden rather than left empty.
 */
export function substituteCertificatePlaceholders(html: string, values: CertificateHtmlValues): string {
  let out = html
    .replaceAll('{{STUDENT_NAME}}', escapeHtml(values.studentName))
    .replaceAll('{{COURSE_NAME}}', escapeHtml(values.courseName))
    .replaceAll('{{COURSE_ICON}}', values.courseIcon)
    .replaceAll('{{BATCH}}', values.batch === null ? '' : escapeHtml(values.batch))
    .replaceAll('{{CERTIFICATE_NUMBER}}', escapeHtml(values.certificateNumber))
    .replaceAll('{{SIGNATURE_NAME}}', escapeHtml(values.signatureName))
    .replaceAll('{{SIGNATURE_TITLE}}', escapeHtml(values.signatureTitle))
    .replaceAll('{{QR_CODE}}', values.qrCode);
  if (values.batch === null) {
    // Hide the row (absolute layout: nothing else moves). Best-effort
    // for custom templates — it hides any element classed batch-row.
    out = out.includes('</head>')
      ? out.replace('</head>', `${HIDE_BATCH_ROW_STYLE}</head>`)
      : `${HIDE_BATCH_ROW_STYLE}${out}`;
  }
  return out;
}

/**
 * Resolve {{COURSE_ICON}} for a course. Python -> the Python logo
 * asset. Otherwise the course thumbnail, fetched server-side and
 * embedded as a data URI when usable; anything else -> transparent.
 */
export async function resolveCourseIcon(
  slug: string,
  title: string,
  thumbnail: string,
): Promise<string> {
  if (isPythonCourse(slug, title)) {
    return `data:image/png;base64,${images.pythonLogo}`;
  }
  const url = thumbnail?.trim() ?? '';
  if (!url) return TRANSPARENT_ICON_DATA_URI;
  try {
    const absolute = /^https?:\/\//i.test(url) ? url : `https://codebettle-web.vercel.app${url.startsWith('/') ? '' : '/'}${url}`;
    const res = await fetch(absolute, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return TRANSPARENT_ICON_DATA_URI;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return TRANSPARENT_ICON_DATA_URI;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 2 * 1024 * 1024) return TRANSPARENT_ICON_DATA_URI;
    const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpeg' : 'png';
    return `data:image/${ext};base64,${buf.toString('base64')}`;
  } catch {
    return TRANSPARENT_ICON_DATA_URI;
  }
}

export interface BuildCertificateHtmlInput {
  studentName: string;
  courseSlug: string;
  courseTitle: string;
  courseThumbnail: string;
  courseTemplateHtml: string | null;
  /** Stored batch on the certificate (may be null). */
  batch: string | null;
  certificateNumber: string;
  verificationToken: string;
  signatureName?: string;
  signatureTitle?: string;
}

export interface BuiltCertificateHtml {
  html: string;
  isDefaultTemplate: boolean;
  batch: string | null;
  verifyUrl: string;
}

/**
 * Assemble the final HTML for one certificate: pick the template,
 * build the QR (bee logo between the dots), resolve the course icon
 * and batch, substitute everything. This HTML is what the headless
 * browser renders to PDF — it is never sent to the student.
 */
export async function buildCertificateHtml(input: BuildCertificateHtmlInput): Promise<BuiltCertificateHtml> {
  const chosen = chooseCertificateTemplate(input.courseTemplateHtml);
  const batch = resolveBatch(input.batch, input.courseSlug, input.courseTitle);
  const verifyUrl = verifyUrlForToken(input.verificationToken);
  const [courseIcon, qr] = await Promise.all([
    resolveCourseIcon(input.courseSlug, input.courseTitle, input.courseThumbnail),
    Promise.resolve(buildVerifyQrPng(verifyUrl)),
  ]);
  const courseName = chosen.isDefault
    ? stripBatchSuffixFromCourseName(input.courseTitle).toUpperCase()
    : stripBatchSuffixFromCourseName(input.courseTitle);
  const html = substituteCertificatePlaceholders(chosen.html, {
    studentName: toTitleCaseName(input.studentName),
    courseName,
    courseIcon,
    batch,
    certificateNumber: input.certificateNumber,
    signatureName: input.signatureName ?? DEFAULT_SIGNATURE_NAME,
    signatureTitle: input.signatureTitle ?? DEFAULT_SIGNATURE_TITLE,
    qrCode: qr.dataUri,
  });
  return { html, isDefaultTemplate: chosen.isDefault, batch, verifyUrl };
}
