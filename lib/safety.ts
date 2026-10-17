// Message & listing safety screen. Runs on the server before anything is stored or delivered.
// Pure module (no imports) so it can be unit-tested and reused for chat, first messages and listings.
//
// Rules are deliberately transparent and fast. In production you would add an ML/LLM classifier
// behind the same interface for the gray areas; the rule layer stays as the cheap first pass.

export type SafetyCategory = "sexual" | "harassment" | "privacy" | "scam";

export type SafetyResult =
  | { ok: true }
  | { ok: false; category: SafetyCategory; title: string; guidance: string; reason: string };

export const CATEGORY_INFO: Record<SafetyCategory, { label: string; title: string; guidance: string }> = {
  sexual: {
    label: "Sexual content",
    title: "Message not sent: sexual content",
    guidance:
      "CampusLoop is for buying, selling and trading. Sexual comments, requests or advances aren't allowed. Repeated attempts suspend your account and are reported to campus safety.",
  },
  harassment: {
    label: "Harassment or threats",
    title: "Message not sent: harassment or threats",
    guidance:
      "Insults, slurs and threats aren't allowed, even if a deal goes wrong. If you have a problem with a sale, open a dispute and a CampusLoop moderator will step in.",
  },
  privacy: {
    label: "Personal information",
    title: "Hold on: that's personal information",
    guidance:
      "For your safety, keep phone numbers, emails, home or room addresses, ID numbers and login codes out of chat. Arrange the handoff here and meet at one of your campus's safe spots.",
  },
  scam: {
    label: "Off-platform payment",
    title: "Message not sent: payment outside CampusLoop",
    guidance:
      "Paying through Venmo, Zelle, Cash App, gift cards or wire transfers skips escrow, and you lose buyer protection. Use “Buy with CampusLoop Protect” so the money is held until you've inspected the item.",
  },
};

/** Categories the LLM layer adds on top of the rule categories. */
export type ModerationCategory = SafetyCategory | "prohibited" | "offensive";

export const MODERATION_INFO: Record<ModerationCategory, { label: string; title: string; guidance: string }> = {
  ...CATEGORY_INFO,
  prohibited: {
    label: "Prohibited item",
    title: "Not allowed: prohibited item",
    guidance:
      "Weapons, ammunition, drugs, vapes, alcohol, fake IDs and stolen or counterfeit goods can't be bought, sold or arranged on CampusLoop, even through chat.",
  },
  offensive: {
    label: "Offensive content",
    title: "Message not sent: offensive content",
    guidance:
      "Hate speech, extremist content, graphic violence and other offensive messages aren't allowed on CampusLoop, whether or not they're about a deal.",
  },
};

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

/** Lowercases, undoes common character swaps, collapses repeats and joins spaced-out letters ("n u d e s"). */
export function normalize(text: string): string {
  let t = text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  t = t.replace(/[013457@$!]/g, (c) => LEET[c] ?? c);
  t = t.replace(/[*_~^]/g, ""); // "s*xy", "f_ck"
  t = t.replace(/(.)\1{2,}/g, "$1$1"); // "sooooo" -> "soo"
  t = t.replace(/\b(?:[a-z][\s.\-]+){2,}[a-z]\b/g, (m) => m.replace(/[\s.\-]+/g, "")); // "n.u.d.e.s" -> "nudes"
  return t.replace(/\s+/g, " ");
}

const W = (words: string[]) => new RegExp(`\\b(?:${words.join("|")})\\b`, "i");

const SEXUAL = W([
  "sex", "sexy", "sext(?:ing)?", "nudes?", "naked", "horny", "hook ?up", "hooking up", "boobs?", "tits", "titties",
  "dick ?pics?", "blow ?job", "handjob", "onlyfans", "netflix and chill", "sugar (?:daddy|baby|mommy)",
  "pay (?:me )?(?:in|with) (?:your body|kind|favors)", "(?:you(?:'re| are)?|ur|u r) (?:so )?(?:hot|sexy|fine af)",
  "come (?:over|to my room) (?:tonight|alone)", "send (?:me )?(?:pics|a pic) of you", "your body", "booty call",
  "make out", "f+wb", "friends with benefits", "kinky", "strip for",
]);

const HARASS = W([
  "kill (?:you|u|ya)", "kys", "kill yourself", "hurt (?:you|u)", "beat (?:you|u|ya)(?: up)?", "i(?:'ll| will) find (?:you|u)",
  "i know where (?:you|u) live", "watch your back", "you(?:'ll| will) regret", "shoot (?:you|u)", "rape",
  "(?:f+u*c+k+|ph?uck) (?:you|u|off)", "f u", "stfu", "piece of shit", "dumb ?(?:ass|bitch)", "stupid (?:bitch|ass|idiot)",
  "bitch", "slut", "whore", "retard(?:ed)?", "fag(?:got)?", "nigg(?:er|a)s?", "idiot", "moron", "loser", "worthless",
]);

const SCAM = W([
  "venmo", "zelle", "cash ?app", "cashtag", "paypal(?: me)?", "western union", "money ?gram", "wire (?:me|transfer|the money)",
  "gift ?cards?", "itunes cards?", "google play cards?", "crypto", "bitcoin", "btc", "usdt",
  "pay (?:me )?(?:outside|off) (?:the )?(?:app|campusloop|platform)", "skip (?:the )?escrow", "don'?t use (?:the )?escrow",
]);

const PRIVACY_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/, reason: "a phone number" },
  { re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, reason: "an email address" },
  { re: /\b\d{3}-\d{2}-\d{4}\b/, reason: "a Social Security number" },
  { re: /\b\d{1,5}\s+(?:[a-z]+\s){1,3}(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pl|place)\b/i, reason: "a street address" },
  { re: /\b(?:room|rm|apt|apartment|unit|suite)\s*#?\s*\d{2,4}[a-z]?\b/i, reason: "a room or apartment number" },
  { re: /\b(?:cwid|student id|banner id)\s*(?:is|:|#)?\s*\d{6,}/i, reason: "a student ID number" },
  {
    re: /\b(?:send|give|tell|text|dm|share|what'?s|whats)\s+(?:me\s+)?(?:your|ur|the)\s+(?:phone ?number|number|cell|address|home address|room number|dorm room|ssn|social security|password|pass ?code|login code|verification code|6.digit code|student id|cwid|bank|card number)\b/i,
    reason: "a request for someone's personal details",
  },
];

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

function hasCardNumber(text: string): boolean {
  for (const m of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return true;
  }
  return false;
}

function block(category: SafetyCategory, reason: string): SafetyResult {
  const info = CATEGORY_INFO[category];
  return { ok: false, category, title: info.title, guidance: info.guidance, reason };
}

/** Screens free text. Order matters: the most serious categories are reported first. */
export function screenText(raw: string): SafetyResult {
  const text = raw.slice(0, 4000);
  const norm = normalize(text);
  if (SEXUAL.test(norm)) return block("sexual", "sexual language or advances");
  if (HARASS.test(norm)) return block("harassment", "insults, slurs or threats");
  if (hasCardNumber(text)) return block("privacy", "a payment card number");
  for (const p of PRIVACY_PATTERNS) if (p.re.test(text)) return block("privacy", p.reason);
  if (SCAM.test(norm)) return block("scam", "a payment method outside escrow");
  return { ok: true };
}

/** After this many blocked attempts in 24 hours, messaging is paused. */
export const STRIKE_LIMIT = 5;
