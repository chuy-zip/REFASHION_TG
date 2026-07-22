import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, POST_LOGIN_PATH } from "@/lib/routes";

/**
 * Auth gate for the whole app.
 *
 *   /api/*  without a valid JWT  -> 401 JSON (the API is private, never a redirect)
 *   page    without a session    -> redirect to /login
 *   /login  with a session       -> redirect into the app
 *
 * It also refreshes the Supabase session on every request. Route Handlers still
 * call getAuthenticatedUser() themselves — this is the front door, not the lock
 * on each room.
 */
export default async function proxy(request: NextRequest) {
  // Carries the refreshed auth cookies. It must be the response we return, or
  // the session silently expires — the classic @supabase/ssr mistake.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");

  if (!user) {
    if (isApiRoute) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (pathname !== LOGIN_PATH) {
      const url = request.nextUrl.clone();
      url.pathname = LOGIN_PATH;
      return NextResponse.redirect(url);
    }
  }

  if (user && pathname === LOGIN_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = POST_LOGIN_PATH;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  /*
   * Everything except Next internals and static files.
   * Protection is opt-out, not opt-in: a route added tomorrow is already
   * guarded, which is the safe default for an internal tool.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
