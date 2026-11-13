/**
 * HTML sanitization (Phase 7 — SEC-08 XSS fix).
 *
 * Blog posts are written in the admin rich-text editor (contentEditable
 * + execCommand) and rendered to every visitor with
 * dangerouslySetInnerHTML. The editor's own toolbar only produces
 * headings, bold/italic, lists and links — but pasted content can carry
 * anything (script tags, event handlers, iframes), and the stored HTML
 * was saved verbatim. So: sanitize on SAVE (blog service) and again on
 * RENDER (public blog page + admin preview) — the render pass covers
 * posts stored before this fix.
 *
 * Allowlist is deliberately narrow: the formatting the editor can
 * produce, plus plain paragraphs/quotes/code. No img (post images come
 * from the thumbnail field), no style attributes, no event handlers,
 * links only to http/https/mailto.
 */
import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p', 'h2', 'h3', 'h4',
  'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li',
  'a', 'blockquote', 'code', 'pre', 'br', 'hr', 'span',
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'target', 'rel'],
};

const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

/** Strip everything outside the blog allowlist. Never throws. */
export function sanitizeBlogHtml(html: string): string {
  if (!html) return html;
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ALLOWED_SCHEMES,
    // Links that open in a new tab must not expose window.opener.
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          ...(attribs.target === '_blank' ? { rel: 'noopener noreferrer' } : {}),
        },
      }),
    },
  });
}

// ---------------------------------------------------------------------------
// Email HTML (admin email builder).
//
// Same idea as the blog sanitizer, but images ARE allowed — the builder's
// image-insert embeds them as base64 data URIs (self-contained emails,
// no external image loads). Only data:image/* sources survive; an
// external (http/https) img src is removed entirely, so a template can
// never phone home or break on a dead link. No style attributes, no
// event handlers, links only to http/https/mailto. Sanitized on SAVE
// (email-template service) and again on RENDER (renderEmailTemplate) —
// the render pass covers templates stored before this fix.
// ---------------------------------------------------------------------------

const EMAIL_ALLOWED_TAGS = [
  'p', 'h2', 'h3', 'h4',
  'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li',
  'a', 'blockquote', 'code', 'pre', 'br', 'hr', 'span', 'div', 'img',
];

const EMAIL_ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'target', 'rel'],
  // 'style' is listed only so the transform-added max-width style
  // survives — the transform overwrites any input style with the safe
  // value, so an admin-authored style can never pass through.
  img: ['src', 'alt', 'width', 'height', 'style'],
};

/** Strip everything outside the email allowlist. Never throws. */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return html;
  return sanitizeHtml(html, {
    allowedTags: EMAIL_ALLOWED_TAGS,
    allowedAttributes: EMAIL_ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['data'],
    },
    // Drop any img whose src is not an embedded image (external URLs
    // are never allowed in emails).
    exclusiveFilter: (frame) =>
      frame.tag === 'img' && !String(frame.attribs.src || '').startsWith('data:image/'),
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          ...(attribs.target === '_blank' ? { rel: 'noopener noreferrer' } : {}),
        },
      }),
      // Constrain embedded images to the email width (no overflow on
      // narrow screens). The style is added here, never accepted from
      // input — style attributes are not in the allowlist.
      img: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          style: 'max-width: 100%; height: auto; display: block;',
        },
      }),
    },
  });
}
