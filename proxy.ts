import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never block internal auth/public endpoints in proxy.
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/public")) {
    return NextResponse.next();
  }

  // Protect dashboard routes
  if (pathname.startsWith("/dashboard")) {
    const session = await auth();
    if (!session) {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }
  }

  // Protect API routes (except auth and public endpoints)
  if (pathname.startsWith("/api")) {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
