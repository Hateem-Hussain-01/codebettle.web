import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client (Server Components / Route Handlers).
 * Used for Storage (Phase 3/5) and direct Postgres access where needed.
 * Auth is custom (see lib/auth.ts), NOT Supabase Auth, so there is
 * intentionally no middleware refreshing Supabase sessions.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll was called from a Server Component; safe to ignore
            // because no Supabase Auth session is being refreshed here.
          }
        },
      },
    }
  );
}
