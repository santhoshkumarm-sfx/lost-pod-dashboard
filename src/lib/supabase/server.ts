import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Server-side Supabase client bound to the current user's session cookie.
 * All reads/writes made through this client are subject to RLS as that
 * user — this is what every Server Component and most API routes should
 * use. Never use this to bypass RLS.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component with no writable cookie jar —
            // safe to ignore, middleware handles session refresh instead.
          }
        },
        remove(name: string, options) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // see note above
          }
        },
      },
    }
  );
}

/**
 * Service-role client: BYPASSES RLS entirely. Server-only (this file must
 * never be imported from a "use client" component). Reserved for:
 *   - the Gmail/Sheets import workers (they write cases on behalf of the
 *     whole org, not a single RLS-scoped user)
 *   - the daily report generator (cron/edge function)
 *   - admin user-management endpoints that must provision auth.users
 * Every use of this client MUST perform its own authorization check first
 * (see src/lib/auth/roles.ts) since Postgres RLS will not do it for you.
 */
export function createSupabaseServiceRoleClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
