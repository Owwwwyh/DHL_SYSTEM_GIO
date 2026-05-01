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
    "/upload/:path*",
    "/articles/:path*",
    "/review/:path*",
    "/admin/:path*",
    "/profile/:path*",
    "/api-docs/:path*",
  ],
};
