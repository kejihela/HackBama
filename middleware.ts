import { NextResponse, type NextRequest } from "next/server";

// Subdomain routing: ua.campusloop.app/ -> /c/ua. Every campus is served by one deployment;
// adding a campus is a database row, not a deploy. Locally, ua.localhost:3000 works too.
const ROOT = process.env.ROOT_DOMAIN ?? "localhost";
const PASSTHROUGH = /^\/(c|api|admin|_next|favicon)/;

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (!host.endsWith("." + ROOT)) return NextResponse.next();
  const sub = host.slice(0, -(ROOT.length + 1));
  if (!sub || sub === "www" || sub.includes(".")) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PASSTHROUGH.test(pathname)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/c/${sub}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
