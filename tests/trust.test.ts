import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTrust, formatMinutes, type TrustInputs } from "../lib/trust-score.ts";

const base: TrustInputs = {
  accountAgeDays: 30,
  sales: 0,
  purchases: 0,
  loops: 0,
  disputes: 0,
  disputesLost: 0,
  cancels: 0,
  recentFlags: 0,
  replyMinutes: [],
  unanswered: 0,
};

test("a brand-new verified student is 'New', not penalized", () => {
  const t = computeTrust(base);
  assert.equal(t.level, "new");
  assert.equal(t.score, 55);
});

test("active, responsive sellers become Trusted", () => {
  const t = computeTrust({ ...base, sales: 4, replyMinutes: [8, 15, 12, 5] });
  assert.equal(t.score, 89);
  assert.equal(t.level, "trusted");
  assert.ok(t.badges.includes("Fast replier"));
  assert.ok(t.badges.includes("No disputes"));
});

test("deal points are capped so volume alone can't max the score", () => {
  assert.equal(computeTrust({ ...base, purchases: 50 }).score, 85);
});

test("a lost dispute and a blocked message drop a seller to Caution", () => {
  const t = computeTrust({ ...base, disputes: 1, disputesLost: 1, recentFlags: 1, replyMinutes: [30] });
  assert.equal(t.level, "caution");
  assert.ok(t.score < 40);
  assert.ok(t.breakdown.some((b) => b.label.includes("lost") && b.points === -25));
});

test("slow replies and ignoring buyers cost points", () => {
  const t = computeTrust({ ...base, sales: 1, replyMinutes: [3000], unanswered: 3 });
  assert.ok(t.breakdown.some((b) => b.points === -4));
  assert.ok(t.breakdown.some((b) => b.points === -5));
});

test("purchases count half as much as sales", () => {
  assert.equal(computeTrust({ ...base, purchases: 2 }).score, 61);
  assert.equal(computeTrust({ ...base, sales: 2 }).score, 67);
});

test("a counterfeit seller stays in Caution even with purchases and fast replies", () => {
  const t = computeTrust({ ...base, purchases: 2, disputes: 1, disputesLost: 1, recentFlags: 1, replyMinutes: [30] });
  assert.equal(t.level, "caution");
});

test("score stays within 0-100 and the breakdown adds up", () => {
  const worst = computeTrust({ ...base, disputes: 9, disputesLost: 9, cancels: 9, recentFlags: 9 });
  assert.equal(worst.score, 0);
  const t = computeTrust({ ...base, sales: 2, purchases: 1, replyMinutes: [200] });
  assert.equal(t.score, 50 + 5 + 15 + 6);
  assert.equal(t.score, t.breakdown.reduce((s, b) => s + b.points, 0));
});

test("formatMinutes", () => {
  assert.equal(formatMinutes(12), "12 min");
  assert.equal(formatMinutes(150), "3 h");
  assert.equal(formatMinutes(3000), "2 d");
});
