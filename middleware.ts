import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req });
  const { pathname } = req.nextUrl;

  if (!token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // P2-4: forced password change. If the JWT carries the flag, every
  // protected page redirects to /change-password until the user resets it.
  // The change-password page itself is in the (auth) route group so the
  // middleware matcher below intentionally excludes it.
  if (token.mustChangePassword && pathname !== "/change-password") {
    const url = req.nextUrl.clone();
    url.pathname = "/change-password";
    url.searchParams.set("forced", "1");
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Admin-only routes
  if (pathname.startsWith("/admin") && token.role !== "admin") {
    const homeUrl = req.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.searchParams.set("error", "forbidden");
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/upload",
    "/upload/:path*",
    "/articles",
    "/articles/:path*",
    "/review",
    "/review/:path*",
    "/admin",
    "/admin/:path*",
    "/profile",
    "/profile/:path*",
    "/api-docs",
    "/api-docs/:path*",
    "/change-password",
  ],
};
