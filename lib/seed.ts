import { db as getDb, seedTransaction } from "./db";
import { ALL_CATEGORY_KEYS } from "./categories";
import { checkPrice } from "./verification";

// Demo data for three campuses. The interesting part is the "almost loop":
//   Ana (UA) lists a CH 101 chemistry book, trade-only, visible network-wide.
//   Cara (Auburn) wants a chemistry book and lists an Iron Bowl student ticket.
//   Ben (UA) wants an Iron Bowl ticket and lists a mini fridge.
// When Ana adds a want for a mini fridge during the demo, the 3-way loop
// Ana -> Cara -> Ben -> Ana appears across two campuses.

const HOUR = 3600_000;
const DAY = 24 * HOUR;

const TENANTS = [
  {
    id: "ua",
    name: "The University of Alabama",
    short_name: "Alabama",
    mascot: "Crimson Tide",
    city: "Tuscaloosa, AL",
    email_domains: ["ua.edu", "crimson.ua.edu"],
    primary_color: "#9E1B32",
    accent_color: "#828A8F",
    meetup_spots: ["Ferguson Student Center, main lobby", "Gorgas Library steps", "Rec Center front desk", "UAPD lobby (24/7, on camera)"],
  },
  {
    id: "auburn",
    name: "Auburn University",
    short_name: "Auburn",
    mascot: "Tigers",
    city: "Auburn, AL",
    email_domains: ["auburn.edu"],
    primary_color: "#0C2340",
    accent_color: "#E87722",
    meetup_spots: ["Melton Student Center, food court", "RBD Library entrance", "Toomer's Corner"],
  },
  {
    id: "uga",
    name: "University of Georgia",
    short_name: "Georgia",
    mascot: "Bulldogs",
    city: "Athens, GA",
    email_domains: ["uga.edu"],
    primary_color: "#BA0C2F",
    accent_color: "#000000",
    meetup_spots: ["Tate Student Center, 2nd floor", "Main Library lobby", "Ramsey Center entrance"],
  },
];

const USERS: [string, string, string][] = [
  // tenant, email, name
  ["ua", "ana@crimson.ua.edu", "Ana Reyes"],
  ["ua", "ben@crimson.ua.edu", "Ben Carter"],
  ["ua", "devon@crimson.ua.edu", "Devon Price"],
  ["ua", "maya@crimson.ua.edu", "Maya Patel"],
  ["ua", "jordan@crimson.ua.edu", "Jordan Lee"],
  ["auburn", "cara@auburn.edu", "Cara Nguyen"],
  ["auburn", "will@auburn.edu", "Will Thompson"],
  ["auburn", "sofia@auburn.edu", "Sofia Martinez"],
  ["uga", "eli@uga.edu", "Eli Brooks"],
  ["uga", "grace@uga.edu", "Grace Kim"],
];

type L = {
  by: string;
  category: string;
  mode: "sell" | "trade" | "both";
  title: string;
  description: string;
  price?: number;
  course?: string;
  visibility?: "campus" | "network";
  photo?: string; // file in public/seed, credited in lib/photo-credits.json
  ageHours: number;
};

const LISTINGS: L[] = [
  // --- Alabama ---
  { by: "ana", category: "textbooks", mode: "trade", photo: "chem-book", title: "General Chemistry textbook, Tro 5th edition", description: "Used for CH 101 with Dr. Sharma. A few highlighted pages, no water damage. Comes with the solutions manual.", course: "CH 101", visibility: "network", ageHours: 3 },
  { by: "ben", category: "dorm", mode: "both", photo: "mini-fridge", title: "Mini fridge, 3.1 cu ft", description: "Fits under a Tutwiler or Presidential lofted bed. Freezer compartment works great. Pick up at Presidential Village.", price: 6500, ageHours: 7 },
  { by: "devon", category: "textbooks", mode: "sell", photo: "calculus-book", title: "Calculus: Early Transcendentals (Stewart)", description: "For MATH 125/126. Clean copy, no writing.", price: 4500, course: "MATH 125", visibility: "network", ageHours: 20 },
  { by: "devon", category: "lab", mode: "sell", photo: "ti84", title: "TI-84 Plus CE graphing calculator", description: "Approved for all math department exams. Includes charging cable.", price: 7000, ageHours: 30 },
  { by: "maya", category: "lab", mode: "sell", photo: "lab-coat", title: "Lab coat + splash goggles (size M)", description: "Required for BSC 114 and CH 102 labs. Worn one semester.", price: 1800, course: "BSC 114", ageHours: 12 },
  { by: "maya", category: "tutoring", mode: "sell", photo: "orgo-notes", title: "Organic Chemistry tutoring (CH 231/232)", description: "Pre-med senior, A in both semesters. $20/hour, Gorgas Library or Zoom.", price: 2000, course: "CH 231", visibility: "network", ageHours: 50 },
  { by: "jordan", category: "tickets", mode: "sell", photo: "stadium-tuscaloosa", title: "Spare student ticket: Georgia at Alabama", description: "Student section, can transfer through the ticket app. Great for a visiting Dawgs fan.", price: 9000, visibility: "network", ageHours: 5 },
  { by: "jordan", category: "rides", mode: "sell", photo: "packed-hatchback", title: "Ride to BHM airport, Friday before Thanksgiving", description: "Leaving campus 1pm, 3 seats, room for luggage. Split gas.", price: 1500, ageHours: 40 },
  { by: "maya", category: "housing", mode: "sell", photo: "guest-room", title: "Guest room for game weekend near the Strip", description: "Private room in my apartment for a visiting fan, Friday and Saturday night. Walk to Bryant-Denny.", price: 6000, visibility: "network", ageHours: 26 },
  { by: "ben", category: "dorm", mode: "sell", photo: "dorm-room", title: "Crimson 5x7 area rug", description: "Barely used, fits most dorm rooms.", price: 2500, ageHours: 60 },
  { by: "devon", category: "other", mode: "both", photo: "switch-lite", title: "Nintendo Switch Lite", description: "Works perfectly, comes with a case. Would also trade for a good desk chair.", price: 11000, ageHours: 70 },
  { by: "ana", category: "dorm", mode: "sell", photo: "desk-lamp", title: "LED desk lamp with USB charging", description: "Three brightness levels.", price: 1200, ageHours: 90 },

  // --- Auburn ---
  { by: "cara", category: "tickets", mode: "both", photo: "stadium-auburn", title: "Iron Bowl student ticket", description: "Student section ticket for the Iron Bowl at Jordan-Hare. I'd rather trade it for something I need this semester.", price: 15000, visibility: "network", ageHours: 2 },
  { by: "will", category: "housing", mode: "sell", photo: "couch", title: "Couch to crash on, Iron Bowl weekend", description: "Clean couch, 5 min walk from Jordan-Hare. Visiting Bama fans welcome, I promise to be nice.", price: 4000, visibility: "network", ageHours: 10 },
  { by: "will", category: "rides", mode: "sell", photo: "trunk-bags", title: "Ride Tuscaloosa to Auburn, Iron Bowl Friday", description: "Driving back from Tuscaloosa Friday at 4pm, 2 seats.", price: 2500, visibility: "network", ageHours: 15 },
  { by: "sofia", category: "textbooks", mode: "sell", photo: "bio-book-cat", title: "Campbell Biology, 12th edition", description: "For BIOL 1020. Some notes in pencil.", price: 5500, course: "BIOL 1020", ageHours: 33 },
  { by: "sofia", category: "dorm", mode: "sell", photo: "keurig", title: "Keurig K-Mini coffee maker", description: "Navy blue, works great.", price: 3000, ageHours: 45 },
  { by: "cara", category: "tutoring", mode: "sell", photo: "flashcards", title: "Spanish conversation practice", description: "Native speaker, help for SPAN 1010-2020. $15/hour.", price: 1500, visibility: "network", ageHours: 80 },

  // --- Georgia ---
  { by: "eli", category: "rides", mode: "sell", photo: "open-trunk", title: "Ride Athens to Tuscaloosa, Georgia-Alabama weekend", description: "Leaving Friday noon, 3 seats.", price: 3500, visibility: "network", ageHours: 8 },
  { by: "eli", category: "lab", mode: "sell", photo: "dissection-lab", title: "Dissection kit, never opened", description: "Bought for BIOL 1108, dropped the class.", price: 2000, ageHours: 22 },
  { by: "grace", category: "textbooks", mode: "sell", photo: "psych-book", title: "Psychology 2e (OpenStax), printed copy", description: "For PSYC 1101.", price: 1500, course: "PSYC 1101", ageHours: 35 },
  { by: "grace", category: "dorm", mode: "sell", photo: "mattress-topper", title: "Twin XL mattress topper", description: "3 inch memory foam, washed cover.", price: 3000, ageHours: 55 },
];

// Listings the price check held for a moderator: one overpriced, one suspiciously cheap.
const HELD_FOR_REVIEW: L[] = [
  { by: "will", category: "lab", mode: "sell", title: "TI-84 Plus graphing calculator", description: "Works great, a few scratches on the screen.", price: 24000, ageHours: 4 },
  { by: "sofia", category: "other", mode: "sell", title: "Nintendo Switch Lite", description: "Brand new in box, need gone today. Pay first and I'll ship it.", price: 2500, ageHours: 1 },
];

const WANTS: [string, string, string, string | null][] = [
  // user, category, keywords, course code
  ["cara", "textbooks", "chemistry", null],
  ["ben", "tickets", "iron bowl", null],
  ["devon", "dorm", "desk chair", null],
  ["sofia", "textbooks", "", "CH 101"],
  ["grace", "tickets", "alabama", null],
];

export async function seed() {
  const t0 = Date.now();
  const db = getDb();
  await seedTransaction(async () => {
    // Two cold-starting servers can race to seed; the write lock serializes them, and the loser stops here.
    const existing = (await db.prepare("SELECT COUNT(*) AS n FROM tenants").get()) as { n: number };
    if (existing.n > 0) return;

    const insTenant = db.prepare(
      `INSERT INTO tenants (id, name, short_name, mascot, city, email_domains, primary_color, accent_color,
                            categories, meetup_spots, allow_network, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    );
    for (const [i, t] of TENANTS.entries()) {
      await insTenant.run(t.id, t.name, t.short_name, t.mascot, t.city, JSON.stringify(t.email_domains), t.primary_color,
        t.accent_color, JSON.stringify(ALL_CATEGORY_KEYS), JSON.stringify(t.meetup_spots), t0 - (100 - i) * DAY);
    }

    const userIds = new Map<string, { id: number; tenant: string }>();
    const insUser = db.prepare("INSERT INTO users (tenant_id, email, name, created_at) VALUES (?, ?, ?, ?)");
    for (const [tenant, email, name] of USERS) {
      const r = await insUser.run(tenant, email, name, t0 - 30 * DAY);
      userIds.set(email.split("@")[0], { id: Number(r.lastInsertRowid), tenant });
    }

    const insListing = db.prepare(
      `INSERT INTO listings (tenant_id, seller_id, category, mode, title, description, price_cents, course_code,
                             image, visibility, status, price_check, price_low, price_high, price_basis, review_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const listingIds = new Map<string, number>();
    for (const l of [...LISTINGS, ...HELD_FOR_REVIEW]) {
      const u = userIds.get(l.by)!;
      const cents = l.price == null ? null : l.price;
      const pc = cents == null ? null : checkPrice({ title: l.title, category: l.category, price_cents: cents });
      const review = pc && (pc.verdict === "high" || pc.verdict === "low");
      const r = await insListing.run(u.tenant, u.id, l.category, l.mode, l.title, l.description, cents, l.course ?? null,
        l.photo ? `seed/${l.photo}.jpg` : null, l.visibility ?? "campus", review ? "review" : "active",
        pc?.verdict ?? null, pc?.low ?? null, pc?.high ?? null, pc?.basis ?? null,
        review ? "Price outside the typical range; held for a moderator." : null, t0 - l.ageHours * HOUR);
      listingIds.set(l.title, Number(r.lastInsertRowid));
    }

    // Escrow: one payment waiting for the buyer to inspect, one in dispute for the moderator.
    const insOrder = db.prepare(
      `INSERT INTO orders (listing_id, buyer_id, seller_id, amount_cents, fee_cents, status, dispute_reason, auto_release_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insOrderEvent = db.prepare("INSERT INTO order_events (order_id, actor, action, note, created_at) VALUES (?, ?, ?, ?, ?)");
    const order = async (title: string, buyer: string, status: "held" | "disputed", hoursAgo: number, reason: string | null) => {
      const l = LISTINGS.find((x) => x.title === title)!;
      const id = listingIds.get(title)!;
      const at = t0 - hoursAgo * HOUR;
      const amount = l.price!;
      const oid = Number(
        (await insOrder.run(id, userIds.get(buyer)!.id, userIds.get(l.by)!.id, amount, Math.max(50, Math.round(amount * 0.03)), status, reason,
          at + 7 * DAY, at, t0 - HOUR)).lastInsertRowid,
      );
      await db.prepare("UPDATE listings SET status = 'pending' WHERE id = ?").run(id);
      await insOrderEvent.run(oid, "buyer", "Paid into escrow", "CampusLoop is holding the payment. The seller isn't paid until the buyer confirms the item.", at);
      if (reason) await insOrderEvent.run(oid, "buyer", "Dispute opened", reason, t0 - HOUR);
    };
    await order("Crimson 5x7 area rug", "jordan", "held", 20, null);
    await order("Twin XL mattress topper", "eli", "disputed", 30, "There's a big stain on one side that wasn't mentioned in the listing, and it smells like smoke.");

    const insWant = db.prepare(
      "INSERT INTO wants (user_id, tenant_id, category, keywords, course_code, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const [by, category, keywords, course] of WANTS) {
      const u = userIds.get(by)!;
      await insWant.run(u.id, u.tenant, category, keywords, course, t0 - DAY);
    }

    // A few chats so the inbox isn't empty.
    const fridge = (await db.prepare("SELECT id FROM listings WHERE title LIKE 'Mini fridge%'").get()) as { id: number };
    const thread = await db
      .prepare("INSERT INTO threads (listing_id, buyer_id, created_at) VALUES (?, ?, ?)")
      .run(fridge.id, userIds.get("maya")!.id, t0 - 5 * HOUR);
    const insMsg = db.prepare("INSERT INTO messages (thread_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)");
    await insMsg.run(thread.lastInsertRowid, userIds.get("maya")!.id, "Hey! Is the fridge still available? Would you take $55?", t0 - 5 * HOUR);
    await insMsg.run(thread.lastInsertRowid, userIds.get("ben")!.id, "Still here! I'm really hoping to trade it for an Iron Bowl ticket, but I'll keep you posted.", t0 - 4 * HOUR);

    const insEvent = db.prepare("INSERT INTO events (title, home_tenant, away_tenant, starts_at) VALUES (?, ?, ?, ?)");
    await insEvent.run("Georgia at Alabama", "ua", "uga", Date.parse("2026-10-31T19:00:00-05:00"));
    await insEvent.run("Iron Bowl: Alabama at Auburn", "auburn", "ua", Date.parse("2026-11-28T14:30:00-06:00"));
  });
}
