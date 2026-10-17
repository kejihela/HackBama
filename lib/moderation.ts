// Database side of trust & safety: strike counting, the moderator queues, and listing verification
// with live comparables. The pure rules live in safety.ts and verification.ts.

import { db, now } from "./db";
import { STRIKE_LIMIT, MODERATION_INFO, type ModerationCategory } from "./safety";
import { moderate, type ModerationVerdict } from "./ai-moderation";
import { verifyListing, type Comparable, type VerificationResult } from "./verification";

export type Blocked = {
  ok: false;
  category: ModerationCategory;
  title: string;
  guidance: string;
  reason: string;
  strikes: number;
  limit: number;
  suspended: boolean;
  source: ModerationVerdict["source"];
};

async function strikesToday(userId: number): Promise<number> {
  return (
    (await db()
      .prepare("SELECT COUNT(*) AS n FROM safety_flags WHERE user_id = ? AND action = 'blocked' AND created_at > ?")
      .get(userId, now() - 86400_000)) as { n: number }
  ).n;
}

async function logFlag(userId: number, context: "message" | "listing", threadId: number | null, v: ModerationVerdict, excerpt: string) {
  await db()
    .prepare(
      `INSERT INTO safety_flags (user_id, context, thread_id, category, reason, excerpt, action, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, context, threadId, v.category ?? "offensive", v.reason || "possible violation", excerpt.slice(0, 200),
      v.ok ? "review" : "blocked", v.source, now());
}

/**
 * Screens a message before it's stored (rules + LLM). Returns null when it's fine to send;
 * otherwise logs the attempt and returns what to show the sender.
 */
export async function screenMessage(userId: number, body: string, threadId: number | null, about?: string): Promise<Blocked | null> {
  if ((await strikesToday(userId)) >= STRIKE_LIMIT) {
    return {
      ok: false,
      category: "harassment",
      title: "Messaging paused for 24 hours",
      guidance: `Your last ${STRIKE_LIMIT} messages were blocked by CampusLoop's safety screen, so messaging is paused. A moderator will review your account.`,
      reason: "too many blocked messages",
      strikes: STRIKE_LIMIT,
      limit: STRIKE_LIMIT,
      suspended: true,
      source: "rules",
    };
  }
  const v = await moderate(body, { kind: "message", about });
  if (v.ok || !v.category) {
    if (v.needsReview) await logFlag(userId, "message", threadId, v, body);
    return null;
  }
  await logFlag(userId, "message", threadId, v, body);
  const info = MODERATION_INFO[v.category];
  return {
    ok: false,
    category: v.category,
    title: info.title,
    guidance: info.guidance,
    reason: v.reason,
    strikes: await strikesToday(userId),
    limit: STRIKE_LIMIT,
    suspended: false,
    source: v.source,
  };
}

/** Recent asking prices for the same category, used to judge whether a new price is reasonable. */
async function comparables(category: string): Promise<Comparable[]> {
  return (await db()
    .prepare(
      `SELECT title, category, price_cents FROM listings
        WHERE category = ? AND price_cents > 0 AND status IN ('active','pending','sold')
        ORDER BY created_at DESC LIMIT 300`,
    )
    .all(category)) as Comparable[];
}

export async function verifyNewListing(
  userId: number,
  l: { title: string; description: string; category: string; price_cents: number | null },
): Promise<VerificationResult> {
  const text = `${l.title}\n${l.description}`;
  const v = await moderate(text, { kind: "listing" });
  if (v.needsReview || !v.ok) await logFlag(userId, "listing", null, v, `${l.title}: ${l.description}`);
  const textIssue =
    v.ok || !v.category
      ? null
      : v.category === "prohibited"
        ? `${MODERATION_INFO.prohibited.guidance}`
        : `${MODERATION_INFO[v.category].label}: listings can't include ${v.reason}.`;
  return verifyListing(l, await comparables(l.category), textIssue);
}

/** Price check without the safety log, for the live preview on the sell form. */
export async function previewListing(l: { title: string; description: string; category: string; price_cents: number | null }) {
  return verifyListing(l, await comparables(l.category), null);
}

export type FlagRow = { id: number; user_name: string; user_email: string; context: string; category: string; reason: string; excerpt: string; action: string; source: string; created_at: number };

export async function recentFlags(limit = 100): Promise<FlagRow[]> {
  return (await db()
    .prepare(
      `SELECT f.*, u.name AS user_name, u.email AS user_email FROM safety_flags f JOIN users u ON u.id = f.user_id
        ORDER BY f.id DESC LIMIT ?`,
    )
    .all(limit)) as FlagRow[];
}

export type ReviewRow = {
  id: number;
  tenant_id: string;
  title: string;
  description: string;
  category: string;
  price_cents: number | null;
  price_low: number | null;
  price_high: number | null;
  price_basis: string | null;
  price_check: string | null;
  review_note: string | null;
  image: string | null;
  seller_name: string;
  created_at: number;
};

export async function listingsAwaitingReview(): Promise<ReviewRow[]> {
  return (await db()
    .prepare(
      `SELECT l.*, u.name AS seller_name FROM listings l JOIN users u ON u.id = l.seller_id
        WHERE l.status = 'review' ORDER BY l.created_at`,
    )
    .all()) as ReviewRow[];
}

export async function decideReview(listingId: number, approve: boolean, note: string): Promise<boolean> {
  const res = await db()
    .prepare(
      `UPDATE listings SET status = ?, price_check = CASE WHEN ? THEN 'manual' ELSE price_check END,
              review_note = ? WHERE id = ? AND status = 'review'`,
    )
    .run(approve ? "active" : "rejected", approve ? 1 : 0, note || (approve ? "Approved by a moderator." : "Rejected by a moderator."), listingId);
  return res.changes > 0;
}
