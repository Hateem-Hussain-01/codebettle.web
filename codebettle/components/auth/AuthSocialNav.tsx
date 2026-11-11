'use client';

import { FacebookIcon, InstagramIcon, LinkedInIcon, WhatsAppIcon } from './BrandIcons';

/**
 * Small social navbar shown BELOW the auth cards, outside them.
 * Icon-only links for the four profiles, plus a distinct
 * "Join our community" pill for the WhatsApp group — a separate entry
 * from the WhatsApp number icon, not a second identical icon.
 * Every link opens in a new tab.
 */
export default function AuthSocialNav() {
  const iconLinkClass =
    'flex h-9 w-9 items-center justify-center rounded-full border border-dark-border bg-dark-card text-muted transition-colors hover:border-primary/60 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary';

  return (
    <nav aria-label="CodeBettle on social media" className="flex flex-wrap items-center justify-center gap-2.5">
      <a
        href="https://wa.me/923055261893"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with CodeBettle on WhatsApp"
        title="WhatsApp"
        className={iconLinkClass}
      >
        <WhatsAppIcon className="h-4 w-4" />
      </a>
      <a
        href="https://www.facebook.com/profile.php?id=61561458044925&mibextid=JRoKGi"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="CodeBettle on Facebook"
        title="Facebook"
        className={iconLinkClass}
      >
        <FacebookIcon className="h-4 w-4" />
      </a>
      <a
        href="https://www.instagram.com/codebettle?igsh=MWhxd3Vrd202ZTF6NA=="
        target="_blank"
        rel="noopener noreferrer"
        aria-label="CodeBettle on Instagram"
        title="Instagram"
        className={iconLinkClass}
      >
        <InstagramIcon className="h-4 w-4" />
      </a>
      <a
        href="https://www.linkedin.com/company/codebettle/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="CodeBettle on LinkedIn"
        title="LinkedIn"
        className={iconLinkClass}
      >
        <LinkedInIcon className="h-4 w-4" />
      </a>
      <a
        href="https://chat.whatsapp.com/GDclFx0AVxn2uxxAdwDVj2?mode=ac_t"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-dark focus-visible:outline-2 focus-visible:outline-primary"
      >
        <WhatsAppIcon className="h-4 w-4" />
        Join our community
      </a>
    </nav>
  );
}
