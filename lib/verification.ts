// Listing verification: is the product allowed, and is the price reasonable?
// Pure module (no imports) so it can be unit-tested and called from the live price-check API.
//
// Price ranges come from, in order of preference:
//   1. comparable listings on CampusLoop (same category, overlapping title words), when there are 3+
//   2. a reference table of typical used prices for common campus items
//   3. a broad band for the category
// Out-of-range prices aren't rejected outright. They're held for a human moderator, because a
// pristine item can legitimately cost more, and a suspiciously cheap one is a classic scam signal.

export type PriceVerdict = "fair" | "high" | "low" | "free" | "unknown";

export type PriceCheck = {
  verdict: PriceVerdict;
  low: number; // cents
  high: number; // cents
  basis: string; // human-readable explanation
};

export type VerificationResult =
  | { status: "approved"; price: PriceCheck | null }
  | { status: "review"; price: PriceCheck; reason: string }
  | { status: "rejected"; reason: string };

const $ = (d: number) => d * 100;

// Broad band per category, in dollars.
const CATEGORY_BANDS: Record<string, [number, number, string]> = {
  textbooks: [3, 250, "used textbooks"],
  dorm: [3, 400, "dorm gear"],
  lab: [2, 250, "lab supplies"],
  tickets: [5, 600, "student tickets"],
  tutoring: [8, 80, "tutoring, per hour"],
  rides: [3, 150, "shared rides"],
  housing: [15, 300, "game-day stays, per night"],
  other: [1, 1500, "used items"],
};

// Typical used prices for items students sell all the time. Most specific patterns first.
const REFERENCE: { re: RegExp; cats: string[]; range: [number, number]; label: string }[] = [
  { re: /\bswitch lite\b/, cats: ["other", "dorm"], range: [80, 170], label: "used Nintendo Switch Lite" },
  { re: /\b(?:nintendo )?switch\b/, cats: ["other", "dorm"], range: [120, 280], label: "used Nintendo Switch" },
  { re: /\bps5\b|playstation 5/, cats: ["other", "dorm"], range: [250, 480], label: "used PS5" },
  { re: /\bxbox\b/, cats: ["other", "dorm"], range: [150, 420], label: "used Xbox" },
  { re: /\bmacbook\b|\blaptop\b/, cats: ["other", "lab"], range: [150, 1400], label: "used laptop" },
  { re: /\bipad\b|\btablet\b/, cats: ["other", "lab"], range: [100, 650], label: "used tablet" },
  { re: /\bairpods?\b|\bearbuds\b/, cats: ["other"], range: [40, 180], label: "used earbuds" },
  { re: /\bti.?8[34]\b|graphing calculator/, cats: ["lab", "other"], range: [40, 110], label: "used graphing calculator" },
  { re: /\bcalculator\b/, cats: ["lab", "other"], range: [5, 110], label: "used calculator" },
  { re: /\bmini.?fridge\b|\bfridge\b|refrigerator/, cats: ["dorm"], range: [30, 150], label: "used mini fridge" },
  { re: /\bmicrowave\b/, cats: ["dorm"], range: [15, 80], label: "used microwave" },
  { re: /\bkeurig\b|coffee maker/, cats: ["dorm"], range: [15, 90], label: "used coffee maker" },
  { re: /mattress topper/, cats: ["dorm"], range: [15, 90], label: "used mattress topper" },
  { re: /\bmattress\b/, cats: ["dorm"], range: [40, 300], label: "used mattress" },
  { re: /\bfuton\b|\bcouch\b|\bsofa\b/, cats: ["dorm"], range: [30, 300], label: "used couch or futon" },
  { re: /desk chair|gaming chair|office chair/, cats: ["dorm"], range: [15, 150], label: "used desk chair" },
  { re: /\brug\b/, cats: ["dorm"], range: [10, 120], label: "used rug" },
  { re: /\blamp\b/, cats: ["dorm"], range: [5, 50], label: "used lamp" },
  { re: /\btv\b|television|monitor/, cats: ["dorm", "other"], range: [40, 400], label: "used TV or monitor" },
  { re: /lab coat|goggles/, cats: ["lab"], range: [5, 40], label: "used lab coat or goggles" },
  { re: /dissection kit/, cats: ["lab"], range: [8, 40], label: "dissection kit" },
  { re: /access code/, cats: ["textbooks"], range: [20, 150], label: "course access code" },
  { re: /\bbike\b|bicycle/, cats: ["rides", "other"], range: [40, 400], label: "used bike" },
  { re: /\bscooter\b/, cats: ["rides", "other"], range: [50, 500], label: "used scooter" },
];

// Things that can't be sold on campus, with the reason shown to the seller.
const PROHIBITED: { re: RegExp; reason: string }[] = [
  { re: /\b(?:vodka|whiskey|whisky|tequila|liquor|alcohol|case of beer|beer for sale|moonshine|everclear)\b/, reason: "Alcohol can't be sold on CampusLoop." },
  { re: /\b(?:weed|marijuana|thc|edibles?|dab pens?|shrooms|cocaine|molly|mdma|lsd|xanax|adderall|vyvanse|percocet|oxy(?:codone|contin)?|ketamine)\b/, reason: "Drugs and prescription medications can't be sold on CampusLoop." },
  { re: /\b(?:vapes?|juul|nicotine|zyns?|cigarettes?|disposable pens?)\b/, reason: "Tobacco and vape products can't be sold on CampusLoop." },
  { re: /\b(?:guns?|pistol|rifle|shotgun|ammo|ammunition|glock|ar.?15|taser|brass knuckles|switchblade)\b/, reason: "Weapons can't be sold on CampusLoop." },
  { re: /\bfake ids?\b|\bfake licen[cs]e\b|\bnovelty id\b/, reason: "Fake IDs are illegal and can't be listed." },
  { re: /\btest ?banks?\b|\bexam answers\b|\banswer keys?\b|\bwrite (?:your|ur) (?:essay|paper)\b|\bdo (?:your|ur) (?:homework|exam|quiz)\b|\btake (?:your|ur) (?:exam|test|quiz)\b/, reason: "Selling exam answers or doing someone's coursework violates academic integrity. Tutoring is welcome." },
  { re: /\breplica\b|\bcounterfeit\b|\bknock.?off\b|\bfake (?:designer|jordans|yeezys|airpods)\b/, reason: "Counterfeit goods can't be sold on CampusLoop." },
  { re: /\b(?:meal swipes?|dining dollars|bama cash|tiger card) for sale\b|\bsell(?:ing)? (?:my )?(?:student id|meal plan)\b/, reason: "Student IDs and meal plans are non-transferable under campus policy." },
];

function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
}

export function prohibitedReason(text: string): string | null {
  const t = text.toLowerCase();
  return PROHIBITED.find((p) => p.re.test(t))?.reason ?? null;
}

export type Comparable = { title: string; category: string; price_cents: number };

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const money = (c: number) => `$${Math.round(c / 100)}`;

/** Works out the reasonable price range for an item and where the asking price falls. */
export function checkPrice(
  item: { title: string; category: string; price_cents: number },
  comps: Comparable[] = [],
): PriceCheck {
  const t = item.title.toLowerCase();
  let low: number, high: number, basis: string;

  const titleWords = new Set(words(item.title));
  const similar = comps.filter(
    (c) => c.category === item.category && c.price_cents > 0 && words(c.title).filter((w) => titleWords.has(w)).length >= 2,
  );
  const ref = REFERENCE.find((r) => r.cats.includes(item.category) && r.re.test(t));

  if (similar.length >= 3) {
    const m = median(similar.map((c) => c.price_cents));
    low = Math.round(m * 0.4);
    high = Math.round(m * 2);
    basis = `${similar.length} similar listings on CampusLoop (median ${money(m)})`;
  } else if (ref) {
    [low, high] = [$(ref.range[0]), $(ref.range[1])];
    basis = `typical price for a ${ref.label}`;
  } else {
    const band = CATEGORY_BANDS[item.category] ?? CATEGORY_BANDS.other;
    [low, high] = [$(band[0]), $(band[1])];
    basis = `typical range for ${band[2]}`;
  }

  let verdict: PriceVerdict;
  if (item.price_cents === 0) verdict = "free";
  else if (item.price_cents > high) verdict = "high";
  else if (item.price_cents < low * 0.5) verdict = "low"; // well below the floor: typo or bait listing
  else verdict = "fair";
  return { verdict, low, high, basis };
}

export function priceMessage(p: PriceCheck): string {
  const range = `${money(p.low)}–${money(p.high)}`;
  switch (p.verdict) {
    case "fair":
      return `Fair price: within the ${range} ${p.basis}.`;
    case "free":
      return "Free: giving it away is always welcome.";
    case "high":
      return `That's above the ${range} ${p.basis}. Lower the price, or send it to a moderator if it's worth more (new in box, rare edition…).`;
    case "low":
      return `That's far below the ${range} ${p.basis}. Very low prices are a common scam pattern. Double-check for a typo, or send it for review.`;
    default:
      return "";
  }
}

/**
 * Full listing check. `textIssue` is the result of the chat safety screen on the title and description,
 * passed in so this module stays dependency-free.
 */
export function verifyListing(
  l: { title: string; description: string; category: string; price_cents: number | null },
  comps: Comparable[] = [],
  textIssue: string | null = null,
): VerificationResult {
  const banned = prohibitedReason(`${l.title} ${l.description}`);
  if (banned) return { status: "rejected", reason: banned };
  if (textIssue) return { status: "rejected", reason: textIssue };
  if (l.title.replace(/[^a-z]/gi, "").length < 3) return { status: "rejected", reason: "Give the listing a real title so buyers know what it is." };
  if (/^[^a-z]*$/.test(l.title) && l.title.length > 12) return { status: "rejected", reason: "Please don't write the title in all caps." };

  if (l.price_cents == null) return { status: "approved", price: null };
  const price = checkPrice({ title: l.title, category: l.category, price_cents: l.price_cents }, comps);
  if (price.verdict === "high" || price.verdict === "low") return { status: "review", price, reason: priceMessage(price) };
  return { status: "approved", price };
}
