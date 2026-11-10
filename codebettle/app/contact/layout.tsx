import { connection } from 'next/server';

/**
 * Segment layout (Phase 7, CSP).
 * This segment's page is a client component with no server data, so
 * Next.js would prerender it as static HTML at build time — and a
 * static page gets no nonce stamped on its scripts, which the nonce
 * CSP would then block in the browser. `await connection()` opts the
 * segment into dynamic rendering so the nonce is applied per request.
 * The layout renders nothing itself; it only carries the opt-in.
 */
export default async function SegmentLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return <>{children}</>;
}
