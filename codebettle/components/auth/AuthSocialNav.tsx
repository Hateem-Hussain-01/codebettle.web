'use client';

import { SocialPlatformIcon, WhatsAppIcon } from './BrandIcons';
import {
  SOCIAL_PLATFORMS,
  WHATSAPP_COMMUNITY_URL,
  type SocialPlatform,
} from '@/lib/social';

/**
 * Small social navbar shown BELOW the auth cards, outside them.
 * Icon-only links for the four profiles, plus a distinct
 * "Join our community" pill for the WhatsApp group — a separate entry
 * from the WhatsApp number icon, not a second identical icon.
 * Every link opens in a new tab.
 *
 * Phase 4, Module 7: the four profile links now come from the ONE
 * shared source in lib/social.ts (the same source the footer reads),
 * so the two can never drift. The rendered links are identical to
 * before — same four platforms, same order, same URLs, same classes.
 * The community pill is NOT a footer social icon and stays here only.
 */
const AUTH_NAV_PLATFORMS: readonly SocialPlatform[] = SOCIAL_PLATFORMS.filter(
  (p) => p.key === 'whatsapp' || p.key === 'facebook' || p.key === 'instagram' || p.key === 'linkedin',
);

export default function AuthSocialNav() {
  const iconLinkClass =
    'flex h-9 w-9 items-center justify-center rounded-full border border-dark-border bg-dark-card text-muted transition-colors hover:border-primary/60 hover:text-primary-text focus-visible:outline-2 focus-visible:outline-primary';

  return (
    <nav aria-label="CodeBettle on social media" className="flex flex-wrap items-center justify-center gap-2.5">
      {AUTH_NAV_PLATFORMS.map((platform) => (
        <a
          key={platform.key}
          href={platform.defaultUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`CodeBettle on ${platform.label}`}
          title={platform.label}
          className={iconLinkClass}
        >
          <SocialPlatformIcon platform={platform.key} className="h-4 w-4" />
        </a>
      ))}
      <a
        href={WHATSAPP_COMMUNITY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary-text transition-colors hover:bg-primary hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
      >
        <WhatsAppIcon className="h-4 w-4" />
        Join our community
      </a>
    </nav>
  );
}
