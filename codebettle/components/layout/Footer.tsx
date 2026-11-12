'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, Phone, MapPin } from 'lucide-react';
import { SocialPlatformIcon } from '@/components/auth/BrandIcons';
import type { SiteSettings } from '@/lib/services/settings-service';
import {
  CONTACT_ADDRESS,
  CONTACT_EMAIL,
  CONTACT_PHONE,
  CONTACT_PHONE_LINK,
  defaultSocialLinks,
  resolveFooterLinks,
  type ResolvedSocialLink,
  type SocialLinkEntry,
} from '@/lib/social';

/**
 * Site footer (Phase 4, Module 7).
 *
 * Social icons come from the ONE shared source in lib/social.ts — the
 * same source the auth navbar reads — so the two can never drift.
 * The footer renders the hardcoded defaults first (the platforms
 * CodeBettle actually uses, with verified profile URLs), then fetches
 * the admin-managed links from GET /api/social-links: when at least
 * one admin row exists, ONLY the enabled rows are shown. Before any
 * admin entry exists — or if the fetch fails, or before the Phase 4
 * migration has run — the defaults stay, so the footer never shows a
 * dead '#' link.
 *
 * This stays a client component on purpose: it is imported by client
 * pages (e.g. /contact) as well as server pages, so it cannot be an
 * async server component, and the build must never touch the database.
 *
 * Contact details: phone +92 305 5261893 (the 305 number), email
 * info@codebettle.com (the address already in the footer). No
 * X slot and no YouTube link — neither is theirs.
 *
 * Settings (Settings fix): the footer shows the admin-managed site
 * settings (site name, contact email/phone/address) when they are
 * available, and the lib/social.ts constants above when they are
 * not. The settings arrive through SiteSettingsContext, provided by
 * the root layout (app/layout.tsx), which reads them server-side
 * with getSiteSettings() — the footer itself never touches the
 * database, and no page that renders the footer needs to change:
 * the provider sits above every page, so all 15 footer usages get
 * the settings for free. When no provider is present (or a field
 * is missing) the CONTACT_* constants render, so the footer is
 * byte-identical to today until an admin saves a value.
 * (Type-only import of SiteSettings: no service code — and no
 * Prisma — ever reaches the client bundle.)
 */
const SiteSettingsContext = createContext<SiteSettings | null>(null);

/** Provided by the root layout around every page (see app/layout.tsx). */
export function SiteSettingsProvider({
  settings,
  children,
}: {
  settings: SiteSettings;
  children: React.ReactNode;
}) {
  return <SiteSettingsContext.Provider value={settings}>{children}</SiteSettingsContext.Provider>;
}

/** Admin-managed settings, or null when no provider is present. */
export function useSiteSettings(): SiteSettings | null {
  return useContext(SiteSettingsContext);
}

export default function Footer() {
  const settings = useSiteSettings();
  // Settings values with the verified hardcoded fallbacks — identical
  // to today until an admin saves a different value.
  const siteName = settings?.siteName ?? 'CodeBettle';
  const contactEmail = settings?.contactEmail ?? CONTACT_EMAIL;
  const contactPhone = settings?.phone ?? CONTACT_PHONE;
  const contactPhoneLink = settings
    ? `tel:${settings.phone.replace(/\s+/g, '')}`
    : CONTACT_PHONE_LINK;
  const contactAddress = settings?.address ?? CONTACT_ADDRESS;

  const [links, setLinks] = useState<ResolvedSocialLink[]>(() => defaultSocialLinks());

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/social-links')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { links?: SocialLinkEntry[] } | null) => {
        if (cancelled || !data || !Array.isArray(data.links)) return;
        // resolveFooterLinks falls back to the defaults when the list
        // is empty, so an empty admin list changes nothing.
        setLinks(resolveFooterLinks(data.links));
      })
      .catch(() => {
        // Offline / pre-migration / any fetch failure: keep defaults.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="bg-dark-card border-t border-dark-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl font-black gradient-text">{siteName}</span>
            </div>
            <p className="text-muted text-sm leading-relaxed mb-6">
              Pakistan&apos;s premier digital institute. We empower students and professionals with industry-relevant tech skills through expert-led courses.
            </p>
            <div className="flex items-center gap-3">
              {links.map((link) => (
                <a
                  key={link.key + link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${siteName} on ${link.label}`}
                  title={link.label}
                  className="w-9 h-9 rounded-lg bg-dark-border flex items-center justify-center text-muted hover:text-primary-text hover:bg-primary/10 transition-all"
                >
                  <SocialPlatformIcon platform={link.key} className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-foreground font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2.5">
              {[['/', 'Home'], ['/courses', 'All Courses'], ['/instructors', 'Instructors'], ['/blog', 'Blog'], ['/about', 'About Us'], ['/become-instructor', 'Become Instructor']].map(([href, label]) => (
                <li key={href}><Link href={href} className="text-muted text-sm hover:text-primary-text transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-foreground font-semibold mb-4">Categories</h4>
            <ul className="space-y-2.5">
              {['Web Development', 'Mobile Development', 'Data Science', 'UI/UX Design', 'DevOps', 'Programming'].map(cat => (
                <li key={cat}><Link href={`/courses?category=${encodeURIComponent(cat)}`} className="text-muted text-sm hover:text-primary-text transition-colors">{cat}</Link></li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-foreground font-semibold mb-4">Contact</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-muted text-sm"><Mail className="w-4 h-4 text-primary-text flex-shrink-0" /><a href={`mailto:${contactEmail}`} className="hover:text-primary-text transition-colors">{contactEmail}</a></li>
              <li className="flex items-center gap-3 text-muted text-sm"><Phone className="w-4 h-4 text-primary-text flex-shrink-0" /><a href={contactPhoneLink} className="hover:text-primary-text transition-colors">{contactPhone}</a></li>
              <li className="flex items-start gap-3 text-muted text-sm"><MapPin className="w-4 h-4 text-primary-text flex-shrink-0 mt-0.5" />{contactAddress}</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-dark-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-muted text-sm">© {new Date().getFullYear()} {siteName}. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-muted text-sm hover:text-primary-text transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-muted text-sm hover:text-primary-text transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
