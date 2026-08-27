import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function operatorMode(): boolean {
  return process.env.CIRCADIA_SURFACE === "mod";
}

function notFound(message: string) {
  return new NextResponse(message, { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (operatorMode()) {
    if (pathname === "/api/study" || pathname.startsWith("/api/study/")) {
      return notFound("This is the operator.");
    }
    if (pathname === "/" || pathname === "") {
      const url = request.nextUrl.clone();
      url.pathname = "/mod";
      return NextResponse.redirect(url);
    }
    const allowed =
      pathname.startsWith("/_next") ||
      pathname === "/mod" ||
      pathname.startsWith("/mod/") ||
      pathname.startsWith("/api/moderator") ||
      pathname === "/icon.svg" ||
      pathname === "/favicon.ico" ||
      pathname === "/manifest.webmanifest";
    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname === "/mod" || pathname.startsWith("/mod/") || pathname.startsWith("/api/moderator")) {
    return notFound("Not found.");
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr).*)"],
};
