import { cookies } from "next/headers";
import crypto from "node:crypto";

// CampusLoop staff / moderator access. One shared key for the hackathon; in production this would be
// a role on the user account with SSO.
const COOKIE = "cl_admin";
const key = () => process.env.ADMIN_KEY ?? "hackbama";
const token = () => crypto.createHash("sha256").update(`campusloop-admin:${key()}`).digest("hex");

export async function isAdmin(): Promise<boolean> {
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return false;
  const a = Buffer.from(v);
  const b = Buffer.from(token());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function adminSignIn(given: string): Promise<boolean> {
  const a = Buffer.from(crypto.createHash("sha256").update(given).digest("hex"));
  const b = Buffer.from(crypto.createHash("sha256").update(key()).digest("hex"));
  if (!crypto.timingSafeEqual(a, b)) return false;
  (await cookies()).set(COOKIE, token(), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 12 * 3600 });
  return true;
}

export async function adminSignOut() {
  (await cookies()).delete(COOKIE);
}
