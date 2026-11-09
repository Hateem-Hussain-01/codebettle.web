import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client (Storage uploads, public reads).
 * Uses the publishable key only — never the service-role key.
 * Auth is custom (see lib/auth.ts), NOT Supabase Auth, so there is
 * intentionally no middleware refreshing Supabase sessions.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
