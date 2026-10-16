import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

const sha256 = (s: string) => createHash("sha256").update(s).digest();

function passwordMatches(header: string | null, password: string): boolean {
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const given = decoded.slice(decoded.indexOf(":") + 1);
  return timingSafeEqual(sha256(given), sha256(password));
}

export function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD?.trim();
  if (!password) {
    if (process.env.VERCEL_ENV) {
      return new NextResponse("Set APP_PASSWORD in your project settings, or set it to none to make this app public.", { status: 503 });
    }
    return NextResponse.next();
  }
  if (password === "none") return NextResponse.next();
  if (passwordMatches(req.headers.get("authorization"), password)) return NextResponse.next();
  return new NextResponse("Password required.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="app"' } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)"],
};
