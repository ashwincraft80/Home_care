import { NextResponse, type NextRequest } from "next/server";
import { isDemoMode } from "@/lib/config/env";

/** Supabase email-confirmation / magic-link callback: exchanges the code for a session cookie. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = url.searchParams.get("next") ?? "/dashboard";
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (isDemoMode()) return NextResponse.redirect(new URL("/login", url));
  const code = url.searchParams.get("code");
  if (code) {
    const { createSupabaseServerClient } = await import("@/lib/auth/supabase");
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safe, url));
  }
  return NextResponse.redirect(new URL("/login?error=callback", url));
}
