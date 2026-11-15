import { NextResponse } from 'next/server';

/**
 * Catch-all for unmatched /api/* paths (P-4).
 *
 * Without this, a request to an API path with no route handler falls
 * through Next.js routing and comes back as 200 with the app shell
 * HTML for non-GET methods (GET already 404s) — wrong status codes
 * that confuse monitoring/scanners and mask real 404s. No data is
 * returned and no mutation ever happens on those paths, but the
 * status must say so.
 *
 * This route only ever handles paths no other route claims: Next.js
 * route matching prefers static segments, then dynamic `[id]`
 * segments, and only then a `[...path]` catch-all — so every real
 * API route (including its 405 for a wrong method on an existing
 * route) is untouched. A wrong method on an EXISTING route still
 * returns 405 from that route's handler; anything reaching here is
 * an unmatched path, so every method returns 404 JSON.
 */
function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function GET() {
  return notFound();
}

export async function POST() {
  return notFound();
}

export async function PUT() {
  return notFound();
}

export async function PATCH() {
  return notFound();
}

export async function DELETE() {
  return notFound();
}

export async function OPTIONS() {
  return notFound();
}
