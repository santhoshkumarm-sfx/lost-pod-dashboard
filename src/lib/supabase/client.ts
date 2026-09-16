"use client";

// Browser Supabase client. Uses the anon key ONLY — RLS policies are what
// actually protect the data, so this client is safe to ship to the browser.
import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
