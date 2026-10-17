import { db, now } from "./db";
import { computeTrust, type TrustResult } from "./trust-score";

const DAY = 86400_000;

/**
 * Trust scores for several students at once: two queries total, however many ids,
 * so a grid of listings costs the same as a single profile.
 */
export async function trustFor(userIds: number[]): Promise<Map<number, TrustResult>> {
  const ids = [...new Set(userIds)].filter((n) => Number.isInteger(n));
  const out = new Map<number, TrustResult>();
  if (!ids.length) return out;
  const marks = ids.map(() => "?").join(",");

  const stats = (await db()
    .prepare(
      `SELECT u.id, u.created_at,
         (SELECT COUNT(*) FROM orders o WHERE o.seller_id = u.id AND o.status = 'released') AS sales,
         (SELECT COUNT(*) FROM orders o WHERE o.buyer_id = u.id AND o.status = 'released') AS purchases,
         (SELECT COUNT(DISTINCT tl.cycle_id) FROM trade_legs tl JOIN trade_cycles c ON c.id = tl.cycle_id
           WHERE tl.giver_id = u.id AND c.status = 'completed') AS loops,
         (SELECT COUNT(*) FROM orders o WHERE o.seller_id = u.id AND o.dispute_reason IS NOT NULL) AS disputes,
         (SELECT COUNT(*) FROM orders o WHERE o.seller_id = u.id AND o.status = 'refunded'
            AND EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.actor = 'moderator')) AS disputes_lost,
         (SELECT COUNT(*) FROM orders o WHERE o.seller_id = u.id AND o.status = 'refunded'
            AND EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.actor = 'seller')) AS cancels,
         (SELECT COUNT(*) FROM safety_flags f WHERE f.user_id = u.id AND f.action = 'blocked' AND f.created_at > ?) AS flags
       FROM users u WHERE u.id IN (${marks})`,
    )
    .all(now() - 30 * DAY, ...ids)) as {
    id: number;
    created_at: number;
    sales: number;
    purchases: number;
    loops: number;
    disputes: number;
    disputes_lost: number;
    cancels: number;
    flags: number;
  }[];

  // Response time: in each buyer conversation, minutes from the buyer's first message to the
  // seller's first reply after it.
  const msgs = (await db()
    .prepare(
      `SELECT th.id AS thread, l.seller_id AS seller, m.sender_id AS sender, m.created_at AS at
         FROM threads th JOIN listings l ON l.id = th.listing_id JOIN messages m ON m.thread_id = th.id
        WHERE l.seller_id IN (${marks})
        ORDER BY th.id, m.created_at`,
    )
    .all(...ids)) as { thread: number; seller: number; sender: number; at: number }[];

  const replies = new Map<number, { minutes: number[]; unanswered: number }>();
  const byThread = new Map<number, typeof msgs>();
  for (const m of msgs) byThread.set(m.thread, [...(byThread.get(m.thread) ?? []), m]);
  for (const list of byThread.values()) {
    const seller = list[0].seller;
    const asked = list.find((m) => m.sender !== seller);
    if (!asked) continue;
    const reply = list.find((m) => m.sender === seller && m.at >= asked.at);
    const r = replies.get(seller) ?? { minutes: [], unanswered: 0 };
    if (reply) r.minutes.push((reply.at - asked.at) / 60_000);
    else if (now() - asked.at > DAY) r.unanswered++;
    replies.set(seller, r);
  }

  for (const s of stats) {
    const r = replies.get(s.id) ?? { minutes: [], unanswered: 0 };
    out.set(
      s.id,
      computeTrust({
        accountAgeDays: (now() - s.created_at) / DAY,
        sales: s.sales,
        purchases: s.purchases,
        loops: s.loops,
        disputes: s.disputes,
        disputesLost: s.disputes_lost,
        cancels: s.cancels,
        recentFlags: s.flags,
        replyMinutes: r.minutes,
        unanswered: r.unanswered,
      }),
    );
  }
  return out;
}

export async function trustOf(userId: number): Promise<TrustResult | null> {
  return (await trustFor([userId])).get(userId) ?? null;
}

export type PublicProfile = { id: number; name: string; tenant_id: string; campus: string; campus_color: string; created_at: number };

export async function getProfile(userId: number): Promise<PublicProfile | null> {
  return (
    ((await db()
      .prepare(
        `SELECT u.id, u.name, u.tenant_id, t.short_name AS campus, t.primary_color AS campus_color, u.created_at
           FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.id = ?`,
      )
      .get(userId)) as PublicProfile | undefined) ?? null
  );
}
