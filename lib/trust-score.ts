// Trust score: a 0-100 rating built only from what a student has actually done on CampusLoop.
// Pure module (no imports) so the formula is unit-tested and the same everywhere it's shown.
//
// Everyone starts at 50 for passing .edu verification. Completed deals and fast replies add
// points; disputes, cancellations and blocked messages take them away. Every point is listed
// in the breakdown, so a student can always see why their score is what it is.

export type TrustInputs = {
  accountAgeDays: number;
  sales: number; // escrow orders released to them as seller
  purchases: number; // escrow orders they released as buyer
  loops: number; // completed trade loops they were part of
  disputes: number; // disputes opened against them as seller
  disputesLost: number; // of those, refunded to the buyer by a moderator
  cancels: number; // sales they cancelled after the buyer paid
  recentFlags: number; // messages/listings blocked by the safety screen, last 30 days
  replyMinutes: number[]; // as seller: minutes until their first reply to each buyer
  unanswered: number; // buyer threads with no reply after 24h
};

export type TrustLevel = "trusted" | "reliable" | "fair" | "caution" | "new";

export type TrustResult = {
  score: number;
  level: TrustLevel;
  label: string;
  deals: number;
  medianReplyMinutes: number | null;
  breakdown: { label: string; points: number }[];
  badges: string[];
};

export const LEVEL_LABEL: Record<TrustLevel, string> = {
  trusted: "Trusted",
  reliable: "Reliable",
  fair: "Fair",
  caution: "Caution",
  new: "New member",
};

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  const h = min / 60;
  return h < 24 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`;
}

export function computeTrust(i: TrustInputs): TrustResult {
  const breakdown: { label: string; points: number }[] = [{ label: "Verified student email", points: 50 }];
  const add = (label: string, points: number) => {
    if (points !== 0) breakdown.push({ label, points });
  };

  add(`Member for ${Math.floor(i.accountAgeDays)} days`, Math.min(5, Math.floor(i.accountAgeDays / 6)));

  const deals = i.sales + i.purchases + i.loops;
  const dealParts = [
    i.sales && `${i.sales} sale${i.sales > 1 ? "s" : ""}`,
    i.purchases && `${i.purchases} purchase${i.purchases > 1 ? "s" : ""}`,
    i.loops && `${i.loops} trade loop${i.loops > 1 ? "s" : ""}`,
  ].filter(Boolean);
  // Selling (or trading) honestly says more about trust than buying, so purchases count half.
  add(`Completed ${dealParts.join(", ")}`, Math.min(30, (i.sales + i.loops) * 6 + i.purchases * 3));

  const med = median(i.replyMinutes);
  if (med !== null) {
    const pts = med <= 60 ? 10 : med <= 360 ? 6 : med <= 1440 ? 2 : -4;
    add(`Replies to buyers in about ${formatMinutes(med)}`, pts);
  }
  const asked = i.replyMinutes.length + i.unanswered;
  if (asked >= 2 && i.unanswered / asked > 0.5) add(`Left ${i.unanswered} of ${asked} buyers without a reply`, -5);

  add(`${i.disputes} dispute${i.disputes > 1 ? "s" : ""} opened by buyers`, -4 * i.disputes);
  add(`${i.disputesLost} dispute${i.disputesLost > 1 ? "s" : ""} lost (buyer refunded)`, -25 * i.disputesLost);
  add(`${i.cancels} sale${i.cancels > 1 ? "s" : ""} cancelled after payment`, -4 * i.cancels);
  add(`${i.recentFlags} message${i.recentFlags > 1 ? "s" : ""} blocked by the safety screen (30 days)`, -Math.min(30, 6 * i.recentFlags));

  const score = Math.max(0, Math.min(100, breakdown.reduce((s, b) => s + b.points, 0)));
  const negatives = i.disputes + i.disputesLost + i.cancels + i.recentFlags > 0;
  const level: TrustLevel =
    deals === 0 && !negatives ? "new" : score >= 80 ? "trusted" : score >= 60 ? "reliable" : score >= 40 ? "fair" : "caution";

  const badges: string[] = [];
  if (deals >= 5) badges.push(`${deals} deals done`);
  else if (deals >= 1) badges.push(`${deals} deal${deals > 1 ? "s" : ""} done`);
  if (med !== null && med <= 60 && i.replyMinutes.length >= 2) badges.push("Fast replier");
  if (i.loops >= 1) badges.push("Loop trader");
  if (i.sales >= 2 && i.disputes === 0) badges.push("No disputes");

  return { score, level, label: LEVEL_LABEL[level], deals, medianReplyMinutes: med, breakdown, badges };
}
