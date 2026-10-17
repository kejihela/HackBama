import { db, now } from "./db";
import { GAMEDAY_CATEGORIES } from "./categories";
import { normalizeCourse } from "./cycles";

export type Listing = {
  id: number;
  tenant_id: string;
  seller_id: number;
  category: string;
  mode: "sell" | "trade" | "both";
  title: string;
  description: string;
  price_cents: number | null;
  course_code: string | null;
  image: string | null;
  visibility: "campus" | "network";
  status: string;
  price_check: string | null;
  price_low: number | null;
  price_high: number | null;
  price_basis: string | null;
  review_note: string | null;
  created_at: number;
  seller_name: string;
  tenant_short_name: string;
  tenant_color: string;
};

const LISTING_SELECT = `
  SELECT l.*, u.name AS seller_name, t.short_name AS tenant_short_name, t.primary_color AS tenant_color
    FROM listings l
    JOIN users u ON u.id = l.seller_id
    JOIN tenants t ON t.id = l.tenant_id`;

/**
 * The tenant-isolation rule, applied to every listing read: you see your own school's
 * listings, plus listings other schools opened to the network.
 * (In Postgres this becomes a row-level security policy.)
 */
const VISIBLE = `(l.tenant_id = @viewerTenant OR (l.visibility = 'network' AND t.allow_network = 1))`;

export type BrowseOptions = {
  site: string;
  scope: "campus" | "network";
  viewerTenant: string | null;
  q?: string;
  category?: string;
  categories?: string[];
  excludeTenant?: string;
  limit?: number;
};

export async function browseListings(o: BrowseOptions): Promise<Listing[]> {
  const where = [`l.status = 'active'`, VISIBLE];
  const params: Record<string, unknown> = { viewerTenant: o.viewerTenant ?? "", site: o.site, limit: o.limit ?? 60 };
  if (o.scope === "campus") where.push("l.tenant_id = @site");
  else where.push(`l.visibility = 'network' AND t.allow_network = 1`);
  if (o.excludeTenant) {
    where.push("l.tenant_id != @exclude");
    params.exclude = o.excludeTenant;
  }
  if (o.category) {
    where.push("l.category = @category");
    params.category = o.category;
  }
  if (o.categories?.length) {
    where.push(`l.category IN (${o.categories.map((_, i) => `@cat${i}`).join(",")})`);
    o.categories.forEach((c, i) => (params[`cat${i}`] = c));
  }
  const course = normalizeCourse(o.q);
  if (course) {
    where.push("l.course_code = @course");
    params.course = course;
  } else if (o.q?.trim()) {
    o.q
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .forEach((term, i) => {
        where.push(`(l.title LIKE @q${i} OR l.description LIKE @q${i} OR IFNULL(l.course_code,'') LIKE @q${i})`);
        params[`q${i}`] = `%${term.replace(/[%_]/g, "")}%`;
      });
  }
  return (await db()
    .prepare(`${LISTING_SELECT} WHERE ${where.join(" AND ")} ORDER BY l.created_at DESC LIMIT @limit`)
    .all(params as Record<string, string | number>)) as Listing[];
}

export async function getListing(id: number, viewerTenant: string | null): Promise<Listing | null> {
  return (
    ((await db()
      .prepare(`${LISTING_SELECT} WHERE l.id = @id AND ${VISIBLE}`)
      .get({ id, viewerTenant: viewerTenant ?? "" })) as Listing | undefined) ?? null
  );
}

export async function listingsBySeller(userId: number): Promise<Listing[]> {
  return (await db()
    .prepare(`${LISTING_SELECT} WHERE l.seller_id = ? ORDER BY l.status = 'active' DESC, l.created_at DESC`)
    .all(userId)) as Listing[];
}

export type NewListing = {
  tenant_id: string;
  seller_id: number;
  category: string;
  mode: string;
  title: string;
  description: string;
  price_cents: number | null;
  course_code: string | null;
  image: string | null;
  visibility: string;
  status?: "active" | "review";
  price_check?: string | null;
  price_low?: number | null;
  price_high?: number | null;
  price_basis?: string | null;
  review_note?: string | null;
};

export async function createListing(l: NewListing): Promise<number> {
  return Number(
    (await db()
      .prepare(
        `INSERT INTO listings (tenant_id, seller_id, category, mode, title, description, price_cents, course_code,
                               image, visibility, status, price_check, price_low, price_high, price_basis, review_note, created_at)
         VALUES (@tenant_id, @seller_id, @category, @mode, @title, @description, @price_cents, @course_code,
                 @image, @visibility, @status, @price_check, @price_low, @price_high, @price_basis, @review_note, @created_at)`,
      )
      .run({
        status: "active",
        price_check: null,
        price_low: null,
        price_high: null,
        price_basis: null,
        review_note: null,
        ...l,
        created_at: now(),
      })).lastInsertRowid,
  );
}

export async function setListingStatus(id: number, sellerId: number, status: "active" | "sold"): Promise<boolean> {
  // Only active <-> sold. Listings under review or held in escrow can't be flipped by the seller.
  const from = status === "sold" ? "active" : "sold";
  return (
    (await db().prepare("UPDATE listings SET status = ? WHERE id = ? AND seller_id = ? AND status = ?").run(status, id, sellerId, from)).changes > 0
  );
}

export type Want = { id: number; category: string; keywords: string; course_code: string | null; created_at: number };

export async function wantsFor(userId: number): Promise<Want[]> {
  return (await db().prepare("SELECT * FROM wants WHERE user_id = ? ORDER BY created_at DESC").all(userId)) as Want[];
}

export async function addWant(userId: number, tenantId: string, category: string, keywords: string, course: string | null) {
  await db()
    .prepare("INSERT INTO wants (user_id, tenant_id, category, keywords, course_code, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(userId, tenantId, category, keywords, course, now());
}

export async function removeWant(id: number, userId: number) {
  await db().prepare("DELETE FROM wants WHERE id = ? AND user_id = ?").run(id, userId);
}

/** Listings for courses the viewer said they're taking: the textbook handoff between semesters. */
export async function listingsForMyCourses(userId: number, viewerTenant: string): Promise<Listing[]> {
  return (await db()
    .prepare(
      `${LISTING_SELECT}
        WHERE l.status = 'active' AND l.seller_id != @userId AND ${VISIBLE}
          AND l.course_code IN (SELECT course_code FROM wants WHERE user_id = @userId AND course_code IS NOT NULL)
        ORDER BY l.tenant_id = @viewerTenant DESC, l.created_at DESC LIMIT 12`,
    )
    .all({ userId, viewerTenant })) as Listing[];
}

// ---------- Messaging ----------

export type ThreadSummary = {
  id: number;
  listing_id: number | null;
  cycle_id: number | null;
  title: string;
  other_name: string;
  last_body: string | null;
  last_at: number;
};

export async function canAccessThread(threadId: number, userId: number): Promise<boolean> {
  const row = await db()
    .prepare(
      `SELECT 1 FROM threads th
         LEFT JOIN listings l ON l.id = th.listing_id
        WHERE th.id = @t AND (
              th.buyer_id = @u OR l.seller_id = @u
           OR th.cycle_id IN (SELECT cycle_id FROM trade_legs WHERE giver_id = @u))`,
    )
    .get({ t: threadId, u: userId });
  return !!row;
}

export async function threadsFor(userId: number): Promise<ThreadSummary[]> {
  return (await db()
    .prepare(
      `SELECT th.id, th.listing_id, th.cycle_id,
              CASE WHEN th.cycle_id IS NOT NULL THEN 'Trade loop #' || th.cycle_id ELSE l.title END AS title,
              CASE WHEN th.cycle_id IS NOT NULL THEN
                     (SELECT group_concat(u.name, ', ') FROM trade_legs tl JOIN users u ON u.id = tl.giver_id
                       WHERE tl.cycle_id = th.cycle_id AND tl.giver_id != @u)
                   WHEN l.seller_id = @u THEN b.name ELSE s.name END AS other_name,
              (SELECT body FROM messages m WHERE m.thread_id = th.id ORDER BY m.id DESC LIMIT 1) AS last_body,
              COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.thread_id = th.id), th.created_at) AS last_at
         FROM threads th
         LEFT JOIN listings l ON l.id = th.listing_id
         LEFT JOIN users s ON s.id = l.seller_id
         LEFT JOIN users b ON b.id = th.buyer_id
        WHERE th.buyer_id = @u OR l.seller_id = @u
           OR th.cycle_id IN (SELECT tl.cycle_id FROM trade_legs tl JOIN trade_cycles c ON c.id = tl.cycle_id
                               WHERE tl.giver_id = @u AND c.status IN ('proposed','completed'))
        ORDER BY last_at DESC`,
    )
    .all({ u: userId })) as ThreadSummary[];
}

export async function threadTitle(threadId: number): Promise<{ title: string; listing_id: number | null; cycle_id: number | null } | null> {
  return (
    ((await db()
      .prepare(
        `SELECT CASE WHEN th.cycle_id IS NOT NULL THEN 'Trade loop #' || th.cycle_id ELSE l.title END AS title,
                th.listing_id, th.cycle_id
           FROM threads th LEFT JOIN listings l ON l.id = th.listing_id WHERE th.id = ?`,
      )
      .get(threadId)) as { title: string; listing_id: number | null; cycle_id: number | null } | undefined) ?? null
  );
}

export type Participant = { id: number; name: string; email: string; campus: string; role: "Buyer" | "Seller" | "Loop member" };

/** Everyone in a conversation, with their role, so the chat can label who said what. */
export async function threadParticipants(threadId: number): Promise<Participant[]> {
  return (await db()
    .prepare(
      `SELECT u.id, u.name, u.email, t.short_name AS campus, 'Buyer' AS role
         FROM threads th JOIN users u ON u.id = th.buyer_id JOIN tenants t ON t.id = u.tenant_id
        WHERE th.id = @t AND th.listing_id IS NOT NULL
       UNION ALL
       SELECT u.id, u.name, u.email, t.short_name, 'Seller'
         FROM threads th JOIN listings l ON l.id = th.listing_id JOIN users u ON u.id = l.seller_id
         JOIN tenants t ON t.id = u.tenant_id
        WHERE th.id = @t
       UNION ALL
       SELECT u.id, u.name, u.email, t.short_name, 'Loop member'
         FROM threads th JOIN trade_legs tl ON tl.cycle_id = th.cycle_id JOIN users u ON u.id = tl.giver_id
         JOIN tenants t ON t.id = u.tenant_id
        WHERE th.id = @t
        ORDER BY 5 DESC, 2`,
    )
    .all({ t: threadId })) as Participant[];
}

export async function openListingThread(listingId: number, buyerId: number): Promise<number> {
  const d = db();
  const existing = (await d.prepare("SELECT id FROM threads WHERE listing_id = ? AND buyer_id = ?").get(listingId, buyerId)) as
    | { id: number }
    | undefined;
  if (existing) return existing.id;
  return Number(
    (await d.prepare("INSERT INTO threads (listing_id, buyer_id, created_at) VALUES (?, ?, ?)").run(listingId, buyerId, now()))
      .lastInsertRowid,
  );
}

export type Message = { id: number; sender_id: number; sender_name: string; body: string; created_at: number };

export async function messagesIn(threadId: number, afterId = 0): Promise<Message[]> {
  return (await db()
    .prepare(
      `SELECT m.id, m.sender_id, u.name AS sender_name, m.body, m.created_at
         FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE m.thread_id = ? AND m.id > ? ORDER BY m.id`,
    )
    .all(threadId, afterId)) as Message[];
}

export async function sendMessage(threadId: number, senderId: number, body: string) {
  await db()
    .prepare("INSERT INTO messages (thread_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)")
    .run(threadId, senderId, body.slice(0, 2000), now());
}

// ---------- Game day ----------

export type GameEvent = {
  id: number;
  title: string;
  home_tenant: string;
  away_tenant: string;
  home_name: string;
  away_name: string;
  home_color: string;
  starts_at: number;
};

export async function upcomingEvents(tenantId: string): Promise<GameEvent[]> {
  return (await db()
    .prepare(
      `SELECT e.*, h.short_name AS home_name, a.short_name AS away_name, h.primary_color AS home_color
         FROM events e JOIN tenants h ON h.id = e.home_tenant JOIN tenants a ON a.id = e.away_tenant
        WHERE (e.home_tenant = ? OR e.away_tenant = ?) AND e.starts_at > ?
        ORDER BY e.starts_at`,
    )
    .all(tenantId, tenantId, now() - 12 * 3600_000)) as GameEvent[];
}

export async function gameDayListings(hostTenant: string, viewerTenant: string | null): Promise<Listing[]> {
  return (await browseListings({
    site: hostTenant,
    scope: "campus",
    viewerTenant: viewerTenant,
    categories: GAMEDAY_CATEGORIES,
  })).filter((l) => l.visibility === "network" || l.tenant_id === viewerTenant);
}

export async function networkStats() {
  const d = db();
  const one = async (sql: string) => ((await d.prepare(sql).get()) as { n: number }).n;
  return {
    campuses: await one("SELECT COUNT(*) AS n FROM tenants"),
    students: await one("SELECT COUNT(*) AS n FROM users"),
    listings: await one("SELECT COUNT(*) AS n FROM listings WHERE status = 'active'"),
    loops: await one("SELECT COUNT(*) AS n FROM trade_cycles WHERE status = 'completed'"),
  };
}
