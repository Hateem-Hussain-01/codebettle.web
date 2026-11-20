import BeetleLoader from '@/components/ui/BeetleLoader';

/**
 * Admin portal segment loading state — the beetle loader shows in
 * the page content area while an admin page loads (Eman, 20 Nov
 * 2026). The sidebar + topbar stay mounted, so navigation stays
 * usable while it shows. No artificial delay: instant navigations
 * simply never show it.
 */
export default function Loading() {
  return <BeetleLoader />;
}
