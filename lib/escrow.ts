// CampusLoop Protect: escrow between buyer and seller, with CampusLoop as the middleman.
//
//   buyer pays ──► HELD ──(buyer inspects, releases)──► RELEASED (seller paid)
//                   │  └─(buyer opens dispute)──► DISPUTED ──(moderator)──► RELEASED | REFUNDED
//                   └─(seller cancels)──► REFUNDED
//                   └─(buyer silent past auto_release_at)──► RELEASED
//
// Payments are simulated in demo mode. In production, `holdPayment` creates a Stripe PaymentIntent on
// the platform account and `release` makes a Stripe Connect transfer to the seller's connected account.

import { db, now, transaction } from "./db";
import { voidCyclesWithListings } from "./matching";

export const AUTO_RELEASE_DAYS = 7;
const DAY = 86400_000;

export type OrderStatus = "held" | "disputed" | "released" | "refunded";

export type Order = {
  id: number;
  listing_id: number;
  buyer_id: number;
  seller_id: number;
  amount_cents: number;
  fee_cents: number;
  status: OrderStatus;
  dispute_reason: string | null;
  resolution_note: string | null;
  auto_release_at: number;
  created_at: number;
  updated_at: number;
  listing_title: string;
  listing_image: string | null;
  listing_category: string;
  listing_tenant: string;
  tenant_color: string;
  buyer_name: string;
  seller_name: string;
  buyer_tenant: string;
  seller_tenant: string;
};

export type OrderEvent = { id: number; actor: string; action: string; note: string | null; created_at: number };

/** Buyer-protection fee: 3%, at least $0.50. */
export function feeFor(amountCents: number): number {
  return Math.max(50, Math.round(amountCents * 0.03));
}

const ORDER_SELECT = `
  SELECT o.*, l.title AS listing_title, l.image AS listing_image, l.category AS listing_category,
         l.tenant_id AS listing_tenant, t.primary_color AS tenant_color,
         b.name AS buyer_name, s.name AS seller_name, b.tenant_id AS buyer_tenant, s.tenant_id AS seller_tenant
    FROM orders o
    JOIN listings l ON l.id = o.listing_id
    JOIN tenants t ON t.id = l.tenant_id
    JOIN users b ON b.id = o.buyer_id
    JOIN users s ON s.id = o.seller_id`;

async function log(orderId: number, actor: string, action: string, note: string | null = null, at = now()) {
  await db()
    .prepare("INSERT INTO order_events (order_id, actor, action, note, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(orderId, actor, action, note, at);
}

/** Releases any held payment whose buyer never responded. Runs lazily whenever orders are read. */
export async function sweepAutoReleases() {
  const due = (await db()
    .prepare("SELECT id, listing_id FROM orders WHERE status = 'held' AND auto_release_at <= ?")
    .all(now())) as { id: number; listing_id: number }[];
  for (const o of due) {
    await transaction(async () => {
      const r = await db().prepare("UPDATE orders SET status = 'released', updated_at = ? WHERE id = ? AND status = 'held'").run(now(), o.id);
      if (!r.changes) return; // another request got there first
      await db().prepare("UPDATE listings SET status = 'sold' WHERE id = ?").run(o.listing_id);
      await log(o.id, "system", "Payment auto-released", `No response from the buyer within ${AUTO_RELEASE_DAYS} days.`);
    });
  }
}

async function readOrder(id: number): Promise<Order | null> {
  return ((await db().prepare(`${ORDER_SELECT} WHERE o.id = ?`).get(id)) as Order | undefined) ?? null;
}

export async function getOrder(id: number): Promise<Order | null> {
  await sweepAutoReleases();
  return readOrder(id);
}

export async function orderEvents(id: number): Promise<OrderEvent[]> {
  return (await db().prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY id").all(id)) as OrderEvent[];
}

export async function ordersFor(userId: number): Promise<{ purchases: Order[]; sales: Order[] }> {
  await sweepAutoReleases();
  const q = async (col: string) =>
    (await db()
      .prepare(`${ORDER_SELECT} WHERE o.${col} = ? ORDER BY o.status IN ('held','disputed') DESC, o.updated_at DESC`)
      .all(userId)) as Order[];
  return { purchases: await q("buyer_id"), sales: await q("seller_id") };
}

export async function walletFor(userId: number) {
  await sweepAutoReleases();
  const sum = async (sql: string) => ((await db().prepare(sql).get(userId)) as { n: number | null }).n ?? 0;
  return {
    incomingHeld: await sum("SELECT SUM(amount_cents) AS n FROM orders WHERE seller_id = ? AND status IN ('held','disputed')"),
    earned: await sum("SELECT SUM(amount_cents) AS n FROM orders WHERE seller_id = ? AND status = 'released'"),
    outgoingHeld: await sum("SELECT SUM(amount_cents + fee_cents) AS n FROM orders WHERE buyer_id = ? AND status IN ('held','disputed')"),
  };
}

export async function activeOrderForListing(listingId: number): Promise<Order | null> {
  return (
    ((await db()
      .prepare(`${ORDER_SELECT} WHERE o.listing_id = ? AND o.status IN ('held','disputed')`)
      .get(listingId)) as Order | undefined) ?? null
  );
}

type Result = { ok: true; id: number } | { ok: false; error: string };

/** Buyer pays into escrow. The listing is taken off the market while the money is held. */
export async function holdPayment(listingId: number, buyerId: number): Promise<Result> {
  // Check and take the listing in one write transaction, so two buyers can't pay for the same item.
  const r = await transaction(async (): Promise<Result> => {
    const d = db();
    const l = (await d.prepare("SELECT id, seller_id, price_cents, status, mode, title FROM listings WHERE id = ?").get(listingId)) as
      | { id: number; seller_id: number; price_cents: number | null; status: string; mode: string; title: string }
      | undefined;
    if (!l || l.status !== "active") return { ok: false, error: "This item is no longer available." };
    if (l.seller_id === buyerId) return { ok: false, error: "You can't buy your own listing." };
    if (l.mode === "trade" || l.price_cents == null) return { ok: false, error: "This item is trade-only." };
    if (l.price_cents <= 0) return { ok: false, error: "Free items don't need escrow. Just message the seller." };

    const price = l.price_cents;
    const t = now();
    const id = (
      await d
        .prepare(
          `INSERT INTO orders (listing_id, buyer_id, seller_id, amount_cents, fee_cents, status, auto_release_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'held', ?, ?, ?)`,
        )
        .run(l.id, buyerId, l.seller_id, price, feeFor(price), t + AUTO_RELEASE_DAYS * DAY, t, t)
    ).lastInsertRowid;
    await d.prepare("UPDATE listings SET status = 'pending' WHERE id = ?").run(l.id);
    await log(id, "buyer", "Paid into escrow", `CampusLoop is holding the payment. The seller isn't paid until the buyer confirms the item.`, t);
    return { ok: true, id };
  });
  if (r.ok) await voidCyclesWithListings([listingId]);
  return r;
}

async function transition(
  orderId: number,
  from: OrderStatus[],
  to: OrderStatus,
  listingStatus: string,
  actor: string,
  action: string,
  note: string | null,
  patch: { dispute_reason?: string; resolution_note?: string } = {},
): Promise<Result> {
  return transaction(async (): Promise<Result> => {
    const d = db();
    const o = await readOrder(orderId);
    if (!o || !from.includes(o.status)) return { ok: false, error: "This order can't be changed any more." };
    await d
      .prepare(
        `UPDATE orders SET status = ?, updated_at = ?, dispute_reason = COALESCE(?, dispute_reason),
                           resolution_note = COALESCE(?, resolution_note) WHERE id = ?`,
      )
      .run(to, now(), patch.dispute_reason ?? null, patch.resolution_note ?? null, orderId);
    await d.prepare("UPDATE listings SET status = ? WHERE id = ?").run(listingStatus, o.listing_id);
    await log(orderId, actor, action, note);
    return { ok: true, id: orderId };
  });
}

export async function releaseByBuyer(orderId: number, buyerId: number): Promise<Result> {
  const o = await getOrder(orderId);
  if (!o || o.buyer_id !== buyerId) return { ok: false, error: "Only the buyer can release this payment." };
  return transition(orderId, ["held", "disputed"], "released", "sold", "buyer", "Item accepted, payment released", "The buyer confirmed the item matched the listing.");
}

export async function openDispute(orderId: number, buyerId: number, reason: string): Promise<Result> {
  const o = await getOrder(orderId);
  if (!o || o.buyer_id !== buyerId) return { ok: false, error: "Only the buyer can open a dispute." };
  if (reason.trim().length < 10) return { ok: false, error: "Tell the moderator what's wrong (at least a sentence)." };
  return transition(orderId, ["held"], "disputed", "pending", "buyer", "Dispute opened", reason.trim(), { dispute_reason: reason.trim().slice(0, 1000) });
}

export async function cancelBySeller(orderId: number, sellerId: number): Promise<Result> {
  const o = await getOrder(orderId);
  if (!o || o.seller_id !== sellerId) return { ok: false, error: "Only the seller can cancel this sale." };
  return transition(orderId, ["held"], "refunded", "active", "seller", "Sale cancelled, buyer refunded", "The seller cancelled. The listing is back on the market.");
}

export async function resolveDispute(orderId: number, decision: "release" | "refund", note: string): Promise<Result> {
  const n = note.trim() || (decision === "release" ? "Moderator found the item matched the listing." : "Moderator refunded the buyer.");
  return decision === "release"
    ? transition(orderId, ["disputed", "held"], "released", "sold", "moderator", "Moderator released payment to seller", n, { resolution_note: n })
    : transition(orderId, ["disputed", "held"], "refunded", "active", "moderator", "Moderator refunded buyer", n, { resolution_note: n });
}

export async function ordersForModeration(): Promise<Order[]> {
  await sweepAutoReleases();
  return (await db()
    .prepare(`${ORDER_SELECT} ORDER BY CASE o.status WHEN 'disputed' THEN 0 WHEN 'held' THEN 1 ELSE 2 END, o.updated_at DESC LIMIT 100`)
    .all()) as Order[];
}

export async function escrowTotals() {
  const one = async (sql: string) => ((await db().prepare(sql).get()) as { n: number | null }).n ?? 0;
  return {
    held: await one("SELECT SUM(amount_cents + fee_cents) AS n FROM orders WHERE status IN ('held','disputed')"),
    disputes: await one("SELECT COUNT(*) AS n FROM orders WHERE status = 'disputed'"),
    released: await one("SELECT SUM(amount_cents) AS n FROM orders WHERE status = 'released'"),
    fees: await one("SELECT SUM(fee_cents) AS n FROM orders WHERE status = 'released'"),
  };
}
