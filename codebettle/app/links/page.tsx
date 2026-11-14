import Link from 'next/link';
import { BookOpen, Calendar, Globe, Link2, Mail, MapPin, MessageCircle, Phone, Play, Star, Trophy, Users } from 'lucide-react';
import { SocialPlatformIcon } from '@/components/auth/BrandIcons';
import { SOCIAL_PLATFORMS } from '@/lib/social';
import { getSiteSettings } from '@/lib/services/settings-service';
import { listEnabledLinks } from '@/lib/db/links';

export const metadata = {
  title: 'CodeBettle | Links',
  description: 'CodeBettle — courses, calls and contacts, all in one place.',
};

/**
 * Public Links page (Linktree-style) — one centered card.
 *
 * Reached ONLY by the direct link Eman sends to clients: it is NOT in
 * the navbar, footer, sitemap or robots, and no page on the site links
 * to it. The content is admin-managed (Admin > Links Page): link
 * buttons from the Link table, contact details + tagline from
 * settings, logo from the navbar logo setting. Reads are fail-safe —
 * when the table does not exist yet the page shows its honest empty
 * state instead of crashing.
 *
 * force-dynamic: the page reads the database, so it must be generated
 * per request, not prerendered at build time (there is no database at
 * build time).
 */
export const dynamic = 'force-dynamic';

/** Social icons on the card: the 4 verified CodeBettle profiles. */
const SOCIAL_KEYS = ['facebook', 'instagram', 'linkedin', 'github'] as const;

/** Link-button icon (LINK_ICON_OPTIONS key) -> lucide icon. */
const LINK_ICONS = {
  link: Link2,
  courses: BookOpen,
  call: Phone,
  stories: Trophy,
  ambassador: Users,
  whatsapp: MessageCircle,
  community: Users,
  globe: Globe,
  mail: Mail,
  video: Play,
  calendar: Calendar,
  star: Star,
} as const;

export default async function LinksPage() {
  const [links, settings] = await Promise.all([listEnabledLinks(), getSiteSettings()]);
  const phoneDigits = settings.linksPhone.replace(/[^0-9+]/g, '');
  const socials = SOCIAL_PLATFORMS.filter((p) => (SOCIAL_KEYS as readonly string[]).includes(p.key));

  return (
    <main className="min-h-screen bg-background flex flex-col items-center px-4 py-10 sm:py-14">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-dark-card border border-dark-border rounded-3xl px-6 py-8 sm:px-8 text-center shadow-lg">
          {/* Logo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={settings.navbarLogoUrl} alt="CodeBettle" className="w-52 max-w-full h-auto mx-auto" />
          <h1 className="mt-5 text-2xl font-black text-foreground">CodeBettle</h1>
          <p className="mt-1 text-sm font-semibold text-primary-text">{settings.linksTagline}</p>

          {/* Contact: phone + email on ONE line, location below. */}
          <p className="mt-4 text-sm text-muted flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <a href={`tel:${phoneDigits}`} className="hover:text-foreground transition-colors">
              {settings.linksPhone}
            </a>
            <span aria-hidden className="text-primary-text">•</span>
            <a href={`mailto:${settings.linksEmail}`} className="hover:text-foreground transition-colors">
              {settings.linksEmail}
            </a>
          </p>
          <p className="mt-1 text-sm text-muted flex items-center justify-center gap-1.5">
            <MapPin className="w-4 h-4 shrink-0" aria-hidden />
            {settings.linksLocation}
          </p>

          {/* Link buttons — single column. */}
          <div className="mt-7 flex flex-col gap-3">
            {links.length === 0 ? (
              <p className="text-sm text-muted py-4">Links coming soon — check back shortly.</p>
            ) : (
              links.map((link) => {
                const Icon = LINK_ICONS[link.icon as keyof typeof LINK_ICONS] ?? Link2;
                const external = link.url.startsWith('http');
                return (
                  <Link
                    key={link.id}
                    href={link.url}
                    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="w-full flex items-center gap-3 rounded-xl border border-dark-border bg-background px-4 py-3.5 text-left text-sm font-semibold text-foreground transition-all duration-200 hover:border-primary/60 hover:bg-primary/5"
                  >
                    <Icon className="w-5 h-5 shrink-0 text-primary-text" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{link.label}</span>
                  </Link>
                );
              })
            )}
          </div>

          {/* Social icons */}
          <div className="mt-7 flex items-center justify-center gap-3">
            {socials.map((social) => (
              <a
                key={social.key}
                href={social.defaultUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`CodeBettle on ${social.label}`}
                className="w-10 h-10 rounded-full border border-dark-border bg-background flex items-center justify-center text-muted hover:text-foreground hover:border-primary/60 transition-colors"
              >
                <SocialPlatformIcon platform={social.key} className="w-4 h-4" />
              </a>
            ))}
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted">© 2026 CodeBettle. All rights reserved.</p>
      </div>
    </main>
  );
}
