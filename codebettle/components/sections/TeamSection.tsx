import FadeIn from '@/components/ui/FadeIn';
import TiltCard from '@/components/ui/TiltCard';
import { GithubIcon, LinkedInIcon } from '@/components/auth/BrandIcons';
import type { TeamMember } from '@/lib/db/types';
import { resolveTeamSocials, type TeamSocialPlatform } from '@/lib/management';
import { Globe } from 'lucide-react';

/**
 * Admin-managed team section (PR #32, moved to the About page by
 * Eman's 13 Nov 2026 change; made flat by his 14 Nov 2026 change).
 * Enabled members only, in ONE flat grid, start to end, in the
 * admin-set display order (sortOrder — the admin's up/down arrows).
 * No grouping, no level/department headings. Card design follows the
 * Cardpay reference: photo (or initials fallback), full name,
 * designation, short bio.
 *
 * Social links (Eman, 16 Nov 2026): at most TWO icons, at the
 * BOTTOM-RIGHT of the card, in the order Eman picks per member in
 * admin ("Show on card"). Nothing picked = the first 2 filled links
 * in GitHub, LinkedIn, X, Website order. A member with 1 filled link
 * shows 1 icon; with none the icons row is not rendered at all, so no
 * empty row or gap breaks the layout.
 */
export default function TeamSection({ members }: { members: TeamMember[] }) {
  if (members.length === 0) {
    return (
      <p className="text-center text-muted max-w-md mx-auto">
        Meet the team behind CodeBettle — profiles coming soon.
      </p>
    );
  }
  return (
    <FadeIn>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {members.map((member) => {
          const socials = resolveTeamSocials(member);
          return (
          <TiltCard key={member.id} max={5} className="h-full">
          <article
            className="group bg-dark-card border border-dark-border rounded-2xl overflow-hidden hover:border-primary/40 hover:-translate-y-1 hover:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)] transition-all duration-300 h-full flex flex-col"
          >
            {member.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.photoUrl} alt={member.fullName} className="w-full aspect-[4/3] object-cover group-hover:scale-105 transition-transform duration-500" />
            ) : (
              <div className="w-full aspect-[4/3] bg-primary/10 flex items-center justify-center">
                <span className="text-6xl font-black text-primary-text">{member.fullName.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div className="p-5 flex flex-col flex-1">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-foreground leading-tight">{member.fullName}</h3>
                <p className="text-sm text-primary-text font-medium">{member.designation}</p>
              </div>
              {member.bio && <p className="text-sm text-muted leading-relaxed mt-3 line-clamp-3">{member.bio}</p>}
              {socials.length > 0 && (
                <div className="mt-auto flex items-center justify-end gap-2 pt-4">
                  {socials.map(({ platform, url }) => (
                    <SocialLink key={platform} platform={platform} url={url} fullName={member.fullName} />
                  ))}
                </div>
              )}
            </div>
          </article>
          </TiltCard>
          );
        })}
      </div>
    </FadeIn>
  );
}

/** One social icon link, in the same style the card used before (X as bold text, the rest as icons). */
function SocialLink({ platform, url, fullName }: { platform: TeamSocialPlatform; url: string; fullName: string }) {
  const label =
    platform === 'x'
      ? `${fullName} on X`
      : platform === 'linkedin'
        ? `${fullName} on LinkedIn`
        : platform === 'github'
          ? `${fullName} on GitHub`
          : `${fullName}'s website`;
  if (platform === 'x') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={label} className="text-muted hover:text-foreground font-black text-sm leading-none">X</a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" aria-label={label} className="text-muted hover:text-foreground">
      {platform === 'linkedin' ? (
        <LinkedInIcon className="w-4 h-4" />
      ) : platform === 'github' ? (
        <GithubIcon className="w-4 h-4" />
      ) : (
        <Globe className="w-4 h-4" />
      )}
    </a>
  );
}
