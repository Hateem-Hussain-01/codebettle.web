import FadeIn from '@/components/ui/FadeIn';
import { GithubIcon, LinkedInIcon } from '@/components/auth/BrandIcons';
import type { TeamMember } from '@/lib/db/types';
import { Globe } from 'lucide-react';

/**
 * Admin-managed team section (PR #32, moved to the About page by
 * Eman's 13 Nov 2026 change; made flat by his 14 Nov 2026 change).
 * Enabled members only, in ONE flat grid, start to end, in the
 * admin-set display order (sortOrder — the admin's up/down arrows).
 * No grouping, no level/department headings. Card design follows the
 * Cardpay reference: photo (or initials fallback), full name,
 * designation, X + LinkedIn links, short bio.
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
        {members.map((member) => (
          <article
            key={member.id}
            className="bg-dark-card border border-dark-border rounded-2xl overflow-hidden hover:border-primary/40 transition-all duration-300"
          >
            {member.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.photoUrl} alt={member.fullName} className="w-full aspect-[4/3] object-cover" />
            ) : (
              <div className="w-full aspect-[4/3] bg-primary/10 flex items-center justify-center">
                <span className="text-6xl font-black text-primary-text">{member.fullName.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-foreground leading-tight">{member.fullName}</h3>
                  <p className="text-sm text-primary-text font-medium">{member.designation}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 pt-1">
                  {member.xUrl && (
                    <a href={member.xUrl} target="_blank" rel="noopener noreferrer" aria-label={`${member.fullName} on X`} className="text-muted hover:text-foreground font-black text-sm leading-none">X</a>
                  )}
                  {member.linkedinUrl && (
                    <a href={member.linkedinUrl} target="_blank" rel="noopener noreferrer" aria-label={`${member.fullName} on LinkedIn`} className="text-muted hover:text-foreground">
                      <LinkedInIcon className="w-4 h-4" />
                    </a>
                  )}
                  {member.githubUrl && (
                    <a href={member.githubUrl} target="_blank" rel="noopener noreferrer" aria-label={`${member.fullName} on GitHub`} className="text-muted hover:text-foreground">
                      <GithubIcon className="w-4 h-4" />
                    </a>
                  )}
                  {member.websiteUrl && (
                    <a href={member.websiteUrl} target="_blank" rel="noopener noreferrer" aria-label={`${member.fullName}'s website`} className="text-muted hover:text-foreground">
                      <Globe className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
              {member.bio && <p className="text-sm text-muted leading-relaxed mt-3 line-clamp-3">{member.bio}</p>}
            </div>
          </article>
        ))}
      </div>
    </FadeIn>
  );
}
