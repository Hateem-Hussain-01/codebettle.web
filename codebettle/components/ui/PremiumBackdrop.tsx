/**
 * Decorative depth backdrop for the premium 3D public pages (Eman,
 * 16 Nov 2026). Server-safe, no JavaScript — a static layer of gold
 * glows, a faint grid and a bottom fade, all `aria-hidden` and
 * pointer-transparent so it can never intercept a click.
 *
 * Uses theme tokens (bg-primary/…) so it follows the dark/light
 * theme. The floating motion on top of it (framer-motion / the
 * `animate-float-*` CSS classes) is disabled by the global
 * `prefers-reduced-motion` rules.
 *
 * `hero` — the full treatment for page heroes (two glows + grid).
 * `soft` — a single faint glow for section backgrounds.
 */
export default function PremiumBackdrop({ variant = 'hero' }: { variant?: 'hero' | 'soft' }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/[0.06] rounded-full blur-[120px]" />
      {variant === 'hero' && (
        <>
          <div className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-primary/[0.04] rounded-full blur-[100px]" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(245,197,24,1) 1px, transparent 1px), linear-gradient(90deg, rgba(245,197,24,1) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
          {/* Depth floor: the page fades into the next section. */}
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
        </>
      )}
    </div>
  );
}
