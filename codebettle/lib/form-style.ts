/**
 * Form-level custom styling (Forms Builder GHL upgrade, Worker B).
 *
 * Pure, client-safe helpers — no database or Next.js imports, so the
 * builder, the public form renderer and the unit tests all share one
 * definition of what a legal style is.
 *
 * A style lives INSIDE the stored FormSchema (`schema.style` +
 * `schema.coverImageUrl`) — no model/DB change, no migration. When no
 * style is set, every resolver below falls back to the current
 * dark + gold look, so existing forms render exactly as before.
 *
 * Safety: colours are strict 6-digit hex only (`#rrggbb`) — the
 * validators reject anything else, so no `url(`, `expression(` or
 * other CSS-injection payload can ever reach an inline style.
 * Cover URLs must be https/http or a same-origin `/` path.
 */

export type FormButtonShape = 'rounded' | 'pill' | 'square';
export type FormFont = 'inter' | 'system' | 'serif' | 'mono';
export type FormWidth = 'narrow' | 'medium' | 'wide';

export const FORM_BUTTON_SHAPES: readonly FormButtonShape[] = [
  'rounded',
  'pill',
  'square',
] as const;

export const FORM_FONTS: readonly FormFont[] = ['inter', 'system', 'serif', 'mono'] as const;

export const FORM_WIDTHS: readonly FormWidth[] = ['narrow', 'medium', 'wide'] as const;

/**
 * Whole-form styling. Every field is optional — an absent field means
 * "keep the site default". Declared as a `type` (not an `interface`)
 * so it stays assignable to Prisma's JsonValue, like the other
 * schema shapes in lib/db/types.ts.
 */
export type FormStyle = {
  backgroundColor?: string;
  textColor?: string;
  primaryColor?: string;
  buttonShape?: FormButtonShape;
  font?: FormFont;
  formWidth?: FormWidth;
};

/** Strict 6-digit hex colour: `#rrggbb`, nothing else. */
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}

/**
 * Is this cover-image URL safe to store and render in an <img>?
 * Accepts http(s) URLs and same-origin paths (`/…`). Rejects
 * `javascript:`, `data:`, protocol-relative (`//evil.com`) and
 * anything else — a stored cover URL is rendered verbatim, so the
 * allowlist is the defence.
 */
export function isValidCoverImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  const url = value.trim();
  if (url.startsWith('/')) {
    // Same-origin path — but not protocol-relative `//host/...`.
    return !url.startsWith('//');
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Is this value a legal FormStyle (shape only — colours checked by the validators)? */
export function isFormStyleObject(value: unknown): value is FormStyle {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (
      key !== 'backgroundColor' &&
      key !== 'textColor' &&
      key !== 'primaryColor' &&
      key !== 'buttonShape' &&
      key !== 'font' &&
      key !== 'formWidth'
    ) {
      return false;
    }
  }
  return true;
}

/** Validate a raw `style` value; returns human-readable problems (empty = valid). */
export function validateFormStyleValue(style: unknown): string[] {
  const errors: string[] = [];
  if (style === undefined) return errors;
  if (!isFormStyleObject(style)) {
    errors.push('Schema style must be an object');
    return errors;
  }
  for (const key of ['backgroundColor', 'textColor', 'primaryColor'] as const) {
    if (style[key] !== undefined && !isValidHexColor(style[key])) {
      errors.push(`Schema style.${key} must be a 6-digit hex colour like #f5c518`);
    }
  }
  if (
    style.buttonShape !== undefined &&
    !(FORM_BUTTON_SHAPES as readonly string[]).includes(style.buttonShape)
  ) {
    errors.push('Schema style.buttonShape must be "rounded", "pill" or "square"');
  }
  if (style.font !== undefined && !(FORM_FONTS as readonly string[]).includes(style.font)) {
    errors.push('Schema style.font must be "inter", "system", "serif" or "mono"');
  }
  if (
    style.formWidth !== undefined &&
    !(FORM_WIDTHS as readonly string[]).includes(style.formWidth)
  ) {
    errors.push('Schema style.formWidth must be "narrow", "medium" or "wide"');
  }
  return errors;
}

/** Validate a raw `coverImageUrl` value; returns problems (empty = valid/absent). */
export function validateCoverImageUrlValue(coverImageUrl: unknown): string[] {
  if (coverImageUrl === undefined) return [];
  if (!isValidCoverImageUrl(coverImageUrl)) {
    return [
      'Schema coverImageUrl must be an http(s) URL or a same-origin path starting with /',
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Resolved style — what the renderers actually apply.
// ---------------------------------------------------------------------------

export interface ResolvedFormStyle {
  backgroundColor?: string;
  textColor?: string;
  primaryColor?: string;
  buttonShape: FormButtonShape;
  font: FormFont;
  formWidth: FormWidth;
}

export const DEFAULT_FORM_STYLE: ResolvedFormStyle = {
  buttonShape: 'rounded',
  font: 'inter',
  formWidth: 'medium',
};

/** Merge a stored style over the defaults. Never invents colours: unset colours stay unset. */
export function resolveFormStyle(style?: FormStyle | null): ResolvedFormStyle {
  return {
    backgroundColor: style?.backgroundColor,
    textColor: style?.textColor,
    primaryColor: style?.primaryColor,
    buttonShape: style?.buttonShape ?? DEFAULT_FORM_STYLE.buttonShape,
    font: style?.font ?? DEFAULT_FORM_STYLE.font,
    formWidth: style?.formWidth ?? DEFAULT_FORM_STYLE.formWidth,
  };
}

/** CSS font stack for a font choice. 'inter' is the site default. */
export function formFontFamily(font: FormFont): string {
  switch (font) {
    case 'system':
      return "system-ui, -apple-system, 'Segoe UI', sans-serif";
    case 'serif':
      return "Georgia, 'Times New Roman', serif";
    case 'mono':
      return "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
    case 'inter':
    default:
      return "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
  }
}

/** Max content width (px) for a formWidth choice. 'medium' = the current max-w-2xl (672px). */
export function formMaxWidthPx(formWidth: FormWidth): number {
  switch (formWidth) {
    case 'narrow':
      return 480;
    case 'wide':
      return 896;
    case 'medium':
    default:
      return 672;
  }
}

/** Submit-button corner radius for a buttonShape choice. */
export function formButtonBorderRadius(shape: FormButtonShape): string {
  switch (shape) {
    case 'pill':
      return '9999px';
    case 'square':
      return '0px';
    case 'rounded':
    default:
      return '8px';
  }
}

/**
 * Readable text colour on top of a chosen button colour: dark text on
 * light buttons, white text on dark ones (WCAG relative-luminance
 * threshold). The site default (gold #f5c518) gets dark text, matching
 * the primary Button variant's `text-ink`.
 */
export function formButtonTextColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.179 ? '#1a1a1a' : '#ffffff';
}

// ---------------------------------------------------------------------------
// Share / embed — one definition of the public URL and snippet.
// ---------------------------------------------------------------------------

/** Public URL of a form: `{origin}/forms/{slug}`. */
export function buildFormShareUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, '')}/forms/${slug}`;
}

/**
 * Embed snippet for a form. The iframe points at the embed render
 * (`?embed=1`, standalone form — no Navbar/Footer/hero) and is safe
 * to paste on any site: it renders a public form only, never session
 * data or admin content. The title is escaped so a form name cannot
 * break out of the attribute.
 */
export function buildEmbedSnippet(origin: string, slug: string, name: string): string {
  const url = `${buildFormShareUrl(origin, slug)}?embed=1`;
  const title = name.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<iframe src="${url}" width="100%" height="600" style="border:0" title="${title}"></iframe>`;
}
