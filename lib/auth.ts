import { cookies } from "next/headers";
import crypto from "node:crypto";
import { db, now } from "./db";
import { tenantForEmail, type Tenant } from "./tenant";

const COOKIE = "cl_session";
const SESSION_TTL = 30 * 24 * 3600_000;
const CODE_TTL = 10 * 60_000;

/** Without an email provider the app runs in demo mode: codes are shown on screen. */
export const DEMO_MODE = !process.env.RESEND_API_KEY;

export type Viewer = {
  id: number;
  email: string;
  name: string;
  tenant_id: string;
  tenant_short_name: string;
};

export async function getViewer(): Promise<Viewer | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = (await db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.tenant_id, t.short_name AS tenant_short_name
         FROM sessions s JOIN users u ON u.id = s.user_id JOIN tenants t ON t.id = u.tenant_id
        WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, now())) as Viewer | undefined;
  return row ?? null;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export type CodeResult =
  | { ok: true; tenant: Tenant; demoCode?: string }
  | { ok: false; error: string };

export async function requestCode(rawEmail: string): Promise<CodeResult> {
  const email = normalizeEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  const tenant = await tenantForEmail(email);
  if (!tenant) {
    return {
      ok: false,
      error: email.endsWith(".edu")
        ? "Your school isn't on CampusLoop yet. Ask your student government to launch it."
        : "CampusLoop is for verified students. Use your school .edu email.",
    };
  }
  const code = String(crypto.randomInt(100000, 1000000));
  await db()
    .prepare(
      `INSERT INTO login_codes (email, code, tenant_id, attempts, expires_at) VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(email) DO UPDATE SET code = excluded.code, tenant_id = excluded.tenant_id,
                                        attempts = 0, expires_at = excluded.expires_at`,
    )
    .run(email, code, tenant.id, now() + CODE_TTL);

  if (DEMO_MODE) return { ok: true, tenant, demoCode: code };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "CampusLoop <onboarding@resend.dev>",
      to: email,
      subject: `${code} is your CampusLoop code`,
      text: `Your ${tenant.short_name} CampusLoop sign-in code is ${code}. It expires in 10 minutes.`,
    }),
  });
  if (!res.ok) return { ok: false, error: "Couldn't send the email. Try again in a minute." };
  return { ok: true, tenant };
}

export async function verifyCode(rawEmail: string, code: string): Promise<{ ok: true; user: Viewer } | { ok: false; error: string }> {
  const email = normalizeEmail(rawEmail);
  const d = db();
  const row = (await d.prepare("SELECT * FROM login_codes WHERE email = ?").get(email)) as
    | { code: string; tenant_id: string; attempts: number; expires_at: number }
    | undefined;
  if (!row || row.expires_at < now()) return { ok: false, error: "That code expired. Request a new one." };
  if (row.attempts >= 5) return { ok: false, error: "Too many attempts. Request a new code." };
  const a = Buffer.from(row.code);
  const b = Buffer.from(code.trim().padEnd(row.code.length).slice(0, row.code.length));
  if (!crypto.timingSafeEqual(a, b)) {
    await d.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?").run(email);
    return { ok: false, error: "Wrong code. Check your email and try again." };
  }
  await d.prepare("DELETE FROM login_codes WHERE email = ?").run(email);
  return { ok: true, user: await startSession(email, row.tenant_id) };
}

/** Demo-mode shortcut: sign in as an existing seeded student without a code. */
export async function demoSignIn(email: string): Promise<Viewer | null> {
  if (!DEMO_MODE) return null;
  const u = (await db().prepare("SELECT tenant_id FROM users WHERE email = ?").get(normalizeEmail(email))) as
    | { tenant_id: string }
    | undefined;
  return u ? startSession(normalizeEmail(email), u.tenant_id) : null;
}

async function startSession(email: string, tenantId: string): Promise<Viewer> {
  const d = db();
  let user = (await d.prepare("SELECT id FROM users WHERE email = ?").get(email)) as { id: number } | undefined;
  if (!user) {
    const name = email
      .split("@")[0]
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join(" ");
    const r = await d
      .prepare("INSERT INTO users (tenant_id, email, name, created_at) VALUES (?, ?, ?, ?)")
      .run(tenantId, email, name || "Student", now());
    user = { id: Number(r.lastInsertRowid) };
  }
  const token = crypto.randomBytes(32).toString("base64url");
  await d.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, user.id, now() + SESSION_TTL);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL / 1000,
  });
  return (await getViewerByToken(token))!;
}

async function getViewerByToken(token: string): Promise<Viewer | null> {
  return (
    ((await db()
      .prepare(
        `SELECT u.id, u.email, u.name, u.tenant_id, t.short_name AS tenant_short_name
           FROM sessions s JOIN users u ON u.id = s.user_id JOIN tenants t ON t.id = u.tenant_id
          WHERE s.token = ?`,
      )
      .get(token)) as Viewer | undefined) ?? null
  );
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  jar.delete(COOKIE);
}
