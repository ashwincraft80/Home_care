import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/config/env";

/** Per-request Supabase client bound to the user's auth cookies (publishable/anon key only). */
export async function createSupabaseServerClient() {
  const cfg = getSupabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are refreshed by proxy.ts instead.
        }
      },
    },
  });
}

/**
 * Service-role client for storage operations ONLY, after the HomeCare server has authorised
 * the request. Never expose this client or its key to the browser.
 */
export function createSupabaseServiceClient() {
  const cfg = getSupabaseConfig();
  return createClient(cfg.url, cfg.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
