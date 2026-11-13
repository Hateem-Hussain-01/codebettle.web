/**
 * Page Builder — block model, slug validation, block parsing/sanitising.
 *
 * Pure functions only — no Next.js imports, unit-testable. The builder
 * stores blocks as JSON on the Page row (no per-block tables), so it adds
 * no extra tables and no extra load to the website/hosting. The public
 * page server-renders the blocks; the admin preview renders the same
 * shared component from the editor state.
 *
 * Block shape: { id, type, layout: { width, height }, content }.
 * - layout.width: percent of the page container (25–100, default 100).
 * - layout.height: min-height in px (120–800) or undefined = auto.
 * Drag-to-resize in the editor adjusts these two numbers with native
 * pointer events (no library); number inputs are the precise fallback.
 */
import { sanitizeEmailHtml } from './sanitize';

export type PageBlockType = 'hero' | 'text' | 'image' | 'stats' | 'cta';

export interface HeroBlockContent {
  heading: string;
  subtext: string;
  imageUrl: string;
  ctaLabel: string;
  ctaLink: string;
}

export interface TextBlockContent {
  html: string;
}

export interface ImageBlockContent {
  imageUrl: string;
  alt: string;
}

export interface StatItem {
  value: string;
  label: string;
}

export interface StatsBlockContent {
  items: StatItem[];
}

export interface CtaBlockContent {
  heading: string;
  text: string;
  buttonLabel: string;
  buttonLink: string;
}

export type PageBlockContent =
  | HeroBlockContent
  | TextBlockContent
  | ImageBlockContent
  | StatsBlockContent
  | CtaBlockContent;

export interface PageBlockLayout {
  /** Percent of the page container, 25–100. */
  width: number;
  /** Min-height in px, 120–800. Undefined = auto height. */
  height?: number;
}

export interface PageBlock {
  id: string;
  type: PageBlockType;
  layout: PageBlockLayout;
  content: PageBlockContent;
}

export const PAGE_BLOCK_TYPES: readonly PageBlockType[] = ['hero', 'text', 'image', 'stats', 'cta'];

export const PAGE_BLOCK_LABELS: Record<PageBlockType, string> = {
  hero: 'Hero',
  text: 'Text',
  image: 'Image',
  stats: 'Stats',
  cta: 'Call to Action',
};

/** Hard limits: a page with more than this many blocks is rejected. */
export const MAX_PAGE_BLOCKS = 50;
export const MAX_PAGE_TITLE_LENGTH = 200;
export const MAX_SLUG_LENGTH = 80;
export const MIN_BLOCK_WIDTH = 25;
export const MAX_BLOCK_WIDTH = 100;
export const MIN_BLOCK_HEIGHT = 120;
export const MAX_BLOCK_HEIGHT = 800;
export const MAX_STAT_ITEMS = 8;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Slugs that would be confusing as /pages/<slug> (admin/auth words and
 * the builder's own section name). Pages live under /pages/, so they
 * cannot collide with top-level routes — this is only about clarity.
 */
export const RESERVED_PAGE_SLUGS: readonly string[] = [
  'admin',
  'api',
  'auth',
  'login',
  'register',
  'pages',
  'sitemap',
  'robots',
];

/** Turn free text into a URL-safe slug: lowercase, dashes, nothing else. */
export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH);
}

/** Error message when the slug is not usable, null when it is fine. */
export function validateSlug(slug: string): string | null {
  if (!slug) return 'URL is required';
  if (slug.length > MAX_SLUG_LENGTH) return `URL must be ${MAX_SLUG_LENGTH} characters or fewer`;
  if (!SLUG_RE.test(slug)) return 'URL may only use lowercase letters, numbers and hyphens';
  if (RESERVED_PAGE_SLUGS.includes(slug)) return 'This URL is reserved';
  return null;
}

export function isValidSlug(slug: string): boolean {
  return validateSlug(slug) === null;
}

/** Default content for a freshly added block of each type. */
export function defaultBlockContent(type: PageBlockType): PageBlockContent {
  switch (type) {
    case 'hero':
      return { heading: '', subtext: '', imageUrl: '', ctaLabel: '', ctaLink: '' };
    case 'text':
      return { html: '' };
    case 'image':
      return { imageUrl: '', alt: '' };
    case 'stats':
      return { items: [{ value: '', label: '' }] };
    case 'cta':
      return { heading: '', text: '', buttonLabel: '', buttonLink: '' };
  }
}

/** A new block with defaults (client-generated id; the server re-checks it). */
export function createBlock(type: PageBlockType, id: string): PageBlock {
  return { id, type, layout: { width: 100 }, content: defaultBlockContent(type) };
}

function asString(value: unknown, max = 500): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, max);
}

function clampWidth(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 100;
  return Math.min(MAX_BLOCK_WIDTH, Math.max(MIN_BLOCK_WIDTH, n));
}

function clampHeight(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : NaN;
  if (Number.isNaN(n)) return undefined;
  return Math.min(MAX_BLOCK_HEIGHT, Math.max(MIN_BLOCK_HEIGHT, n));
}

function parseBlockContent(type: PageBlockType, raw: unknown): PageBlockContent {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  switch (type) {
    case 'hero':
      return {
        heading: asString(r.heading, 200),
        subtext: asString(r.subtext, 500),
        imageUrl: asString(r.imageUrl, 2000),
        ctaLabel: asString(r.ctaLabel, 100),
        ctaLink: asString(r.ctaLink, 2000),
      };
    case 'text':
      // Rich text from the editor — sanitized the same way saved
      // email/CEO text is (formatting + safe links/images only).
      return { html: sanitizeEmailHtml(asString(r.html, 100_000)) };
    case 'image':
      return { imageUrl: asString(r.imageUrl, 2000), alt: asString(r.alt, 200) };
    case 'stats': {
      const rawItems = Array.isArray(r.items) ? r.items : [];
      const items = rawItems.slice(0, MAX_STAT_ITEMS).map((item) => {
        const it = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        return { value: asString(it.value, 50), label: asString(it.label, 100) };
      });
      return { items: items.length > 0 ? items : [{ value: '', label: '' }] };
    }
    case 'cta':
      return {
        heading: asString(r.heading, 200),
        text: asString(r.text, 500),
        buttonLabel: asString(r.buttonLabel, 100),
        buttonLink: asString(r.buttonLink, 2000),
      };
  }
}

/**
 * Parse + sanitise an unknown blocks value (DB Json, API body, editor
 * state) into valid blocks. Unknown block types are dropped, strings
 * are length-capped, layouts are clamped, text HTML is sanitised.
 * Never throws — bad input yields an empty list.
 */
export function parsePageBlocks(value: unknown): PageBlock[] {
  if (!Array.isArray(value)) return [];
  const out: PageBlock[] = [];
  for (const raw of value.slice(0, MAX_PAGE_BLOCKS)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.type !== 'string' || !(PAGE_BLOCK_TYPES as readonly string[]).includes(r.type)) continue;
    const type = r.type as PageBlockType;
    const layoutRaw = (r.layout && typeof r.layout === 'object' ? r.layout : {}) as Record<string, unknown>;
    const layout: PageBlockLayout = { width: clampWidth(layoutRaw.width) };
    const height = clampHeight(layoutRaw.height);
    if (height !== undefined) layout.height = height;
    out.push({
      id: typeof r.id === 'string' && r.id.length > 0 ? r.id.slice(0, 100) : `block-${out.length + 1}`,
      type,
      layout,
      content: parseBlockContent(type, r.content),
    });
  }
  return out;
}

/** Save-time alias: the same parse/sanitise applied before persisting. */
export function sanitizePageBlocks(value: unknown): PageBlock[] {
  return parsePageBlocks(value);
}

/**
 * Only http(s) URLs are renderable as images (blocks uploaded images
 * live on the public course-images bucket). Anything else renders as
 * no image — never a javascript: or data: URL.
 */
export function safeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '';
}

/**
 * Links may be absolute http(s) or site-relative (/path). Anything else
 * (javascript:, //host, bare text) is dropped.
 */
export function safeLink(href: string): string {
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/(?!\/)/.test(trimmed)) return trimmed;
  return '';
}

export type PageStatus = 'draft' | 'published';

export function isPageStatus(value: unknown): value is PageStatus {
  return value === 'draft' || value === 'published';
}
