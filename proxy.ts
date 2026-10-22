import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Runs before every page request:
 *  - forwards the pathname so server code can build "return to" links after sign-in;
 *  - issues a random anonymous analytics id (no personal data);
 *  - in supabase mode, refreshes the Supabase auth session cookies.
 * Authorisation is NOT done here; every page, action and route checks access on the server.
 */
export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-hc-pathname", request.nextUrl.pathname + request.nextUrl.search);
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  if (process.env.HOMECARE_MODE === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request: { headers: requestHeaders } });
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      });
      await supabase.auth.getUser();
    }
  }

  if (!request.cookies.get("hc_aid")) {
    response.cookies.set("hc_aid", crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
