import { db, now, transaction } from "./db";
import { findCycles, matchScore, pickDisjoint, type Edge } from "./cycles";

type TradeListing = {
  id: number;
  tenant_id: string;
  seller_id: number;
  category: string;
  title: string;
  description: string;
  course_code: string | null;
  visibility: string;
  allow_network: number;
};

type WantRow = {
  user_id: number;
  tenant_id: string;
  category: string;
  keywords: string;
  course_code: string | null;
  allow_network: number;
};

/**
 * Builds the "who could give what to whom" graph from every tradeable listing and
 * every want, respecting campus visibility (a campus-only listing can only move
 * within its school).
 *
 * This is O(wants x listings), fine for a single campus or a small network. To scale,
 * bucket by category/course code and run it per tenant plus a network pass in a
 * background worker.
 */
export async function buildEdges(): Promise<Edge[]> {
  const listings = (await db()
    .prepare(
      `SELECT l.id, l.tenant_id, l.seller_id, l.category, l.title, l.description, l.course_code, l.visibility,
              t.allow_network
         FROM listings l JOIN tenants t ON t.id = l.tenant_id
        WHERE l.status = 'active' AND l.mode IN ('trade','both')`,
    )
    .all()) as TradeListing[];
  const wants = (await db()
    .prepare(
      `SELECT w.user_id, w.tenant_id, w.category, w.keywords, w.course_code, t.allow_network
         FROM wants w JOIN tenants t ON t.id = w.tenant_id`,
    )
    .all()) as WantRow[];

  const edges: Edge[] = [];
  for (const w of wants) {
    for (const l of listings) {
      if (l.seller_id === w.user_id) continue;
      const visible =
        l.tenant_id === w.tenant_id || (l.visibility === "network" && !!l.allow_network && !!w.allow_network);
      if (!visible) continue;
      const score = matchScore(w, l);
      if (score > 0) edges.push({ from: l.seller_id, to: w.user_id, listingId: l.id, score });
    }
  }
  return edges;
}

/** Finds new trade loops and stores them as proposals. Returns the ids of new loops. */
export async function runMatcher(): Promise<number[]> {
  // One write transaction, so two requests running the matcher at once can't propose the same loop twice.
  return transaction(async () => {
    const d = db();
    const busy = new Set(
      (
        (await d
          .prepare(
            `SELECT DISTINCT tl.giver_id FROM trade_legs tl JOIN trade_cycles c ON c.id = tl.cycle_id
              WHERE c.status = 'proposed'`,
          )
          .all()) as { giver_id: number }[]
      ).map((r) => r.giver_id),
    );
    const known = new Set(
      ((await d.prepare("SELECT signature FROM trade_cycles").all()) as { signature: string }[]).map((r) => r.signature),
    );
    const fresh = findCycles(await buildEdges()).filter((c) => !known.has(c.signature));
    const chosen = pickDisjoint(fresh, busy);

    const created: number[] = [];
    const insCycle = d.prepare("INSERT INTO trade_cycles (signature, score, created_at) VALUES (?, ?, ?)");
    const insLeg = d.prepare(
      "INSERT INTO trade_legs (cycle_id, position, listing_id, giver_id, receiver_id) VALUES (?, ?, ?, ?, ?)",
    );
    const insThread = d.prepare("INSERT INTO threads (cycle_id, created_at) VALUES (?, ?)");
    for (const c of chosen) {
      const id = (await insCycle.run(c.signature, c.score, now())).lastInsertRowid;
      for (const [i, l] of c.legs.entries()) await insLeg.run(id, i, l.listingId, l.from, l.to);
      await insThread.run(id, now());
      created.push(id);
    }
    return created;
  });
}

export type CycleLeg = {
  position: number;
  listing_id: number;
  listing_title: string;
  listing_category: string;
  listing_image: string | null;
  listing_tenant: string;
  giver_id: number;
  giver_name: string;
  giver_tenant: string;
  giver_tenant_name: string;
  receiver_id: number;
  receiver_name: string;
  accepted: number;
};

export type CycleView = {
  id: number;
  status: string;
  score: number;
  created_at: number;
  thread_id: number | null;
  legs: CycleLeg[];
};

export async function cyclesForUser(userId: number): Promise<CycleView[]> {
  const rows = (await db()
    .prepare(
      `SELECT c.*, th.id AS thread_id FROM trade_cycles c
         LEFT JOIN threads th ON th.cycle_id = c.id
        WHERE c.id IN (SELECT cycle_id FROM trade_legs WHERE giver_id = ?)
        ORDER BY CASE c.status WHEN 'proposed' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END, c.created_at DESC`,
    )
    .all(userId)) as Omit<CycleView, "legs">[];
  return Promise.all(rows.map(async (r) => ({ ...r, legs: await legsFor(r.id) })));
}

export async function getCycle(id: number): Promise<CycleView | null> {
  const r = (await db()
    .prepare("SELECT c.*, th.id AS thread_id FROM trade_cycles c LEFT JOIN threads th ON th.cycle_id = c.id WHERE c.id = ?")
    .get(id)) as Omit<CycleView, "legs"> | undefined;
  return r ? { ...r, legs: await legsFor(r.id) } : null;
}

async function legsFor(cycleId: number): Promise<CycleLeg[]> {
  return (await db()
    .prepare(
      `SELECT tl.position, tl.listing_id, l.title AS listing_title, l.category AS listing_category,
              l.image AS listing_image, l.tenant_id AS listing_tenant,
              tl.giver_id, g.name AS giver_name, g.tenant_id AS giver_tenant, gt.short_name AS giver_tenant_name,
              tl.receiver_id, r.name AS receiver_name, tl.accepted
         FROM trade_legs tl
         JOIN listings l ON l.id = tl.listing_id
         JOIN users g ON g.id = tl.giver_id
         JOIN tenants gt ON gt.id = g.tenant_id
         JOIN users r ON r.id = tl.receiver_id
        WHERE tl.cycle_id = ? ORDER BY tl.position`,
    )
    .all(cycleId)) as CycleLeg[];
}

/** Marks the user's leg accepted. When every member has accepted, the loop locks in. */
export async function acceptCycle(cycleId: number, userId: number): Promise<"accepted" | "completed" | "invalid"> {
  const result = await transaction(async () => {
    const d = db();
    const c = await getCycle(cycleId);
    if (!c || c.status !== "proposed" || !c.legs.some((l) => l.giver_id === userId)) return "invalid" as const;
    await d.prepare("UPDATE trade_legs SET accepted = 1 WHERE cycle_id = ? AND giver_id = ?").run(cycleId, userId);
    const { pending } = (await d
      .prepare("SELECT COUNT(*) AS pending FROM trade_legs WHERE cycle_id = ? AND accepted = 0")
      .get(cycleId)) as { pending: number };
    if (pending !== 0) return "accepted" as const;

    await d.prepare("UPDATE trade_cycles SET status = 'completed' WHERE id = ?").run(cycleId);
    const ids = c.legs.map((l) => l.listing_id);
    const marks = ids.map(() => "?").join(",");
    await d.prepare(`UPDATE listings SET status = 'traded' WHERE id IN (${marks})`).run(...ids);
    // Each receiver got what they asked for, so retire the wants this trade satisfied.
    const getListing = d.prepare("SELECT category, title, description, course_code FROM listings WHERE id = ?");
    const getWants = d.prepare("SELECT id, category, keywords, course_code FROM wants WHERE user_id = ?");
    const delWant = d.prepare("DELETE FROM wants WHERE id = ?");
    for (const leg of c.legs) {
      const listing = (await getListing.get(leg.listing_id)) as Parameters<typeof matchScore>[1];
      for (const w of (await getWants.all(leg.receiver_id)) as (Parameters<typeof matchScore>[0] & { id: number })[]) {
        if (matchScore(w, listing) > 0) await delWant.run(w.id);
      }
    }
    await voidCyclesWithListings(ids, cycleId);
    return "completed" as const;
  });
  if (result === "completed") await runMatcher();
  return result;
}

export async function declineCycle(cycleId: number, userId: number): Promise<boolean> {
  const c = await getCycle(cycleId);
  if (!c || c.status !== "proposed" || !c.legs.some((l) => l.giver_id === userId)) return false;
  await db().prepare("UPDATE trade_cycles SET status = 'declined' WHERE id = ? AND status = 'proposed'").run(cycleId);
  await runMatcher();
  return true;
}

/** Cancels open proposals that depend on listings that are no longer available. */
export async function voidCyclesWithListings(listingIds: number[], exceptCycle = -1) {
  if (listingIds.length === 0) return;
  const marks = listingIds.map(() => "?").join(",");
  await db()
    .prepare(
      `UPDATE trade_cycles SET status = 'void'
        WHERE status = 'proposed' AND id != ?
          AND id IN (SELECT cycle_id FROM trade_legs WHERE listing_id IN (${marks}))`,
    )
    .run(exceptCycle, ...listingIds);
}

/** How many students across the network want this course's book, for pricing hints. */
export async function courseDemand(courseCode: string): Promise<number> {
  const { n } = (await db()
    .prepare("SELECT COUNT(DISTINCT user_id) AS n FROM wants WHERE course_code = ?")
    .get(courseCode)) as { n: number };
  return n;
}
