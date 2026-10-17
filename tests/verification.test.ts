import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPrice, verifyListing, prohibitedReason } from "../lib/verification.ts";

const L = (title: string, category: string, dollars: number | null, description = "") => ({
  title,
  description,
  category,
  price_cents: dollars == null ? null : dollars * 100,
});

test("fair prices are approved", () => {
  assert.equal(verifyListing(L("TI-84 Plus CE graphing calculator", "lab", 70)).status, "approved");
  assert.equal(verifyListing(L("Mini fridge, 3.1 cu ft", "dorm", 65)).status, "approved");
  assert.equal(verifyListing(L("Calculus textbook", "textbooks", 45)).status, "approved");
  assert.equal(verifyListing(L("Old lamp", "dorm", 0)).status, "approved"); // free
  assert.equal(verifyListing(L("Chem book", "textbooks", null)).status, "approved"); // trade only
});

test("overpriced and suspiciously cheap items go to review", () => {
  const high = verifyListing(L("TI-84 Plus calculator", "lab", 250));
  assert.equal(high.status, "review");
  const low = verifyListing(L("Nintendo Switch Lite", "other", 5));
  assert.equal(low.status, "review");
  if (low.status === "review") assert.equal(low.price.verdict, "low");
});

test("prohibited items are rejected", () => {
  assert.equal(verifyListing(L("Adderall 20mg", "other", 10)).status, "rejected");
  assert.equal(verifyListing(L("Juul pods", "other", 15)).status, "rejected");
  assert.equal(verifyListing(L("CH 101 test bank", "textbooks", 20)).status, "rejected");
  assert.equal(verifyListing(L("Fake ID", "other", 80)).status, "rejected");
  assert.equal(prohibitedReason("Organic chemistry tutoring"), null);
  assert.equal(prohibitedReason("Beer pong table"), null);
});

test("unsafe text from the safety screen rejects the listing", () => {
  assert.equal(verifyListing(L("Desk", "dorm", 20), [], "personal info").status, "rejected");
});

test("comparables override reference prices when there are enough", () => {
  const comps = [100, 120, 110, 130].map((d) => ({ title: "Iron Bowl student ticket", category: "tickets", price_cents: d * 100 }));
  const p = checkPrice({ title: "Iron Bowl student ticket section N", category: "tickets", price_cents: 150_00 }, comps);
  assert.equal(p.verdict, "fair");
  assert.match(p.basis, /4 similar listings/);
  const p2 = checkPrice({ title: "Iron Bowl student ticket", category: "tickets", price_cents: 400_00 }, comps);
  assert.equal(p2.verdict, "high");
});
