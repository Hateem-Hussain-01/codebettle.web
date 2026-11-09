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
