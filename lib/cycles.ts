// Trade-loop detection, the core of CampusLoop.
//
// Students form a directed graph: an edge giver -> receiver means "the giver has a
// listing the receiver wants". A cycle A -> B -> C -> A is a trade every member is
// happy with even though no two of them want each other's stuff directly.
// This is the same structure kidney-exchange programs use to find donor chains.
//
// This module has no dependencies so it can be tested in isolation.

export type Edge = { from: number; to: number; listingId: number; score: number };
export type Cycle = { legs: Edge[]; score: number; signature: string };

/**
 * Enumerates simple cycles of length 2..maxLen.
 * Each cycle is reported once: it is rooted at its smallest node, and the DFS only
 * visits nodes greater than the root (the trick behind Johnson's algorithm).
 * For each giver/receiver pair, only the best-scoring listing is kept.
 */
export function findCycles(edges: Edge[], maxLen = 4, limit = 1000): Cycle[] {
  const best = new Map<string, Edge>();
  for (const e of edges) {
    if (e.from === e.to) continue;
    const k = `${e.from}>${e.to}`;
    const cur = best.get(k);
    if (!cur || e.score > cur.score || (e.score === cur.score && e.listingId < cur.listingId)) best.set(k, e);
  }
  const adj = new Map<number, Edge[]>();
  for (const e of best.values()) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e);
  }
  for (const list of adj.values()) list.sort((a, b) => a.to - b.to);

  const nodes = [...adj.keys()].sort((a, b) => a - b);
  const out: Cycle[] = [];
  const path: Edge[] = [];
  const onPath = new Set<number>();

  const dfs = (root: number, node: number) => {
    if (out.length >= limit) return;
    for (const e of adj.get(node) ?? []) {
      if (e.to === root && path.length + 1 >= 2) {
        const legs = [...path, e];
        out.push({
          legs,
          score: legs.reduce((s, l) => s + l.score, 0),
          signature: legs.map((l) => l.listingId).sort((a, b) => a - b).join("-"),
        });
        continue;
      }
      if (e.to <= root || onPath.has(e.to) || path.length + 1 >= maxLen) continue;
      onPath.add(e.to);
      path.push(e);
      dfs(root, e.to);
      path.pop();
      onPath.delete(e.to);
    }
  };

  for (const root of nodes) {
    onPath.add(root);
    dfs(root, root);
    onPath.delete(root);
  }
  return out;
}

/**
 * Greedily picks cycles that share no participant, so nobody is promised to two
 * loops at once. Prefers shorter loops (easier to complete), then higher match scores.
 */
export function pickDisjoint(cycles: Cycle[], busyUsers = new Set<number>()): Cycle[] {
  const ranked = [...cycles].sort((a, b) => a.legs.length - b.legs.length || b.score - a.score);
  const used = new Set(busyUsers);
  const chosen: Cycle[] = [];
  for (const c of ranked) {
    if (c.legs.some((l) => used.has(l.from))) continue;
    c.legs.forEach((l) => used.add(l.from));
    chosen.push(c);
  }
  return chosen;
}

const STOP = new Set(["the", "and", "for", "with", "used", "new", "like", "any", "some", "good"]);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

export function normalizeCourse(code: string | null | undefined): string | null {
  if (!code) return null;
  const m = code.toUpperCase().replace(/[^A-Z0-9]/g, "").match(/^([A-Z]{2,5})(\d{3,4}[A-Z]?)$/);
  return m ? `${m[1]} ${m[2]}` : null;
}

/**
 * How well a listing satisfies a want. 0 means no match.
 * Course codes are the strongest signal; keywords are matched as prefixes so
 * "chem" finds "chemistry" and "fridge" finds "minifridge".
 */
export function matchScore(
  want: { category: string; keywords: string; course_code: string | null },
  listing: { category: string; title: string; description: string; course_code: string | null },
): number {
  if (want.category !== "any" && want.category !== listing.category) return 0;
  let score = 0;
  if (want.course_code && listing.course_code && want.course_code === listing.course_code) score += 5;
  const words = tokens(want.keywords);
  if (words.length) {
    const hay = tokens(`${listing.title} ${listing.description}`);
    const hits = words.filter((w) => hay.some((h) => h.startsWith(w) || h.endsWith(w))).length;
    score += hits * 2;
    if (hits === 0 && score === 0) return 0;
  } else if (!want.course_code) {
    score += 1; // category-only want: weakest match
  } else if (score === 0) {
    return 0;
  }
  return score;
}
