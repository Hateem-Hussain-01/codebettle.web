/**
 * Shared block renderer for Page Builder pages.
 *
 * Plain React components (no 'use client', no hooks, no browser APIs),
 * so the SAME rendering is used by the public page (server component —
 * no extra client JS) and by the admin preview pane (imported into the
 * editor client component). Changing a block's look here changes it in
 * both places at once.
 *
 * All styling uses theme tokens only (dark + gold) — no hardcoded
 * colours, so the light-theme audit stays green.
 */
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { sanitizeEmailHtml } from '@/lib/sanitize';
import {
  safeImageUrl,
  safeLink,
  type CtaBlockContent,
  type HeroBlockContent,
  type ImageBlockContent,
  type PageBlock,
  type StatsBlockContent,
  type TextBlockContent,
} from '@/lib/page-builder';

// Shared rich-text styles for rendered text blocks (same element styles
// the RichTextEditor itself uses, theme tokens only).
const RICH_TEXT_CLASS =
  'text-base text-foreground/90 leading-relaxed space-y-3 ' +
  '[&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground ' +
  '[&_h3]:text-base [&_h3]:font-bold [&_h3]:text-foreground ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
  '[&_a]:text-primary-text [&_a]:underline [&_img]:max-w-full [&_img]:h-auto';

const GOLD_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-2 bg-primary text-ink font-bold px-6 py-3 rounded-lg hover:bg-primary-dark transition-colors';

/** Stats grid columns by item count (2–4 across on desktop). */
function statsGridClass(count: number): string {
  if (count <= 1) return 'grid grid-cols-1 gap-6';
  if (count === 2) return 'grid grid-cols-1 sm:grid-cols-2 gap-6';
  if (count === 3) return 'grid grid-cols-1 sm:grid-cols-3 gap-6';
  return 'grid grid-cols-2 lg:grid-cols-4 gap-6';
}

function BlockShell({ block, children }: { block: PageBlock; children: React.ReactNode }) {
  const style: CSSProperties = { width: `${block.layout.width}%`, maxWidth: '100%' };
  if (block.layout.height !== undefined) style.minHeight = block.layout.height;
  return (
    <section className="py-8">
      <div className="mx-auto" style={style}>
        {children}
      </div>
    </section>
  );
}

function HeroBlockView({ content }: { content: HeroBlockContent }) {
  const imageUrl = safeImageUrl(content.imageUrl);
  const ctaLink = safeLink(content.ctaLink);
  return (
    <div className="text-center">
      {content.heading && (
        <h1 className="text-4xl sm:text-5xl font-black text-foreground leading-tight">
          <span className="gradient-text">{content.heading}</span>
        </h1>
      )}
      {content.subtext && <p className="text-muted text-lg leading-relaxed mt-4 max-w-2xl mx-auto">{content.subtext}</p>}
      {ctaLink && content.ctaLabel && (
        <div className="mt-6">
          <Link href={ctaLink} className={GOLD_BUTTON_CLASS}>
            {content.ctaLabel}
          </Link>
        </div>
      )}
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="w-full h-auto rounded-2xl border border-dark-border mt-8" />
      )}
    </div>
  );
}

function TextBlockView({ content }: { content: TextBlockContent }) {
  if (!content.html) return null;
  return (
    <div
      className={RICH_TEXT_CLASS}
      dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(content.html) }}
    />
  );
}

function ImageBlockView({ content }: { content: ImageBlockContent }) {
  const imageUrl = safeImageUrl(content.imageUrl);
  if (!imageUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imageUrl} alt={content.alt || ''} className="w-full h-auto rounded-2xl border border-dark-border" />
  );
}

function StatsBlockView({ content }: { content: StatsBlockContent }) {
  const items = content.items.filter((item) => item.value || item.label);
  if (items.length === 0) return null;
  return (
    <div className={statsGridClass(items.length)}>
      {items.map((item, i) => (
        <div key={i} className="bg-dark-card border border-dark-border rounded-2xl p-6 text-center">
          <p className="text-4xl font-black text-primary-text">{item.value}</p>
          <p className="text-muted text-sm mt-2">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function CtaBlockView({ content }: { content: CtaBlockContent }) {
  const buttonLink = safeLink(content.buttonLink);
  return (
    <div className="bg-dark-card border border-dark-border rounded-2xl p-8 sm:p-10 text-center">
      {content.heading && <h2 className="text-2xl sm:text-3xl font-black text-foreground">{content.heading}</h2>}
      {content.text && <p className="text-muted leading-relaxed mt-3 max-w-xl mx-auto">{content.text}</p>}
      {buttonLink && content.buttonLabel && (
        <div className="mt-6">
          <Link href={buttonLink} className={GOLD_BUTTON_CLASS}>
            {content.buttonLabel}
          </Link>
        </div>
      )}
    </div>
  );
}

export function PageBlockView({ block }: { block: PageBlock }) {
  // Empty blocks render nothing at all — not even the section shell —
  // so a saved-but-unfilled block never leaves a gap on the live page.
  if (isBlockEmpty(block)) return null;
  return (
    <BlockShell block={block}>
      {block.type === 'hero' && <HeroBlockView content={block.content as HeroBlockContent} />}
      {block.type === 'text' && <TextBlockView content={block.content as TextBlockContent} />}
      {block.type === 'image' && <ImageBlockView content={block.content as ImageBlockContent} />}
      {block.type === 'stats' && <StatsBlockView content={block.content as StatsBlockContent} />}
      {block.type === 'cta' && <CtaBlockView content={block.content as CtaBlockContent} />}
    </BlockShell>
  );
}

/** True when a block has no visible content (saved but never filled in). */
function isBlockEmpty(block: PageBlock): boolean {
  switch (block.type) {
    case 'hero': {
      const c = block.content as HeroBlockContent;
      return !c.heading && !c.subtext && !safeImageUrl(c.imageUrl) && !(c.ctaLabel && safeLink(c.ctaLink));
    }
    case 'text': {
      const c = block.content as TextBlockContent;
      const text = c.html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
      return text.length === 0;
    }
    case 'image': {
      const c = block.content as ImageBlockContent;
      return !safeImageUrl(c.imageUrl);
    }
    case 'stats': {
      const c = block.content as StatsBlockContent;
      return !c.items.some((item) => item.value || item.label);
    }
    case 'cta': {
      const c = block.content as CtaBlockContent;
      return !c.heading && !c.text && !(c.buttonLabel && safeLink(c.buttonLink));
    }
  }
}

/** Render a page's blocks in order. Empty pages render nothing. */
export function PageBlocks({ blocks }: { blocks: PageBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <>
      {blocks.map((block) => (
        <PageBlockView key={block.id} block={block} />
      ))}
    </>
  );
}
