import { test } from "node:test";
import assert from "node:assert/strict";
import { findCycles, pickDisjoint, matchScore, normalizeCourse, type Edge } from "../lib/cycles.ts";

const e = (from: number, to: number, listingId: number, score = 1): Edge => ({ from, to, listingId, score });

test("finds a 3-way loop exactly once", () => {
  const cycles = findCycles([e(1, 2, 10), e(2, 3, 20), e(3, 1, 30)]);
  assert.equal(cycles.length, 1);
  assert.deepEqual(cycles[0].legs.map((l) => l.from), [1, 2, 3]);
  assert.equal(cycles[0].signature, "10-20-30");
});

test("finds direct swaps and ignores open chains", () => {
  const cycles = findCycles([e(1, 2, 10), e(2, 1, 20), e(2, 3, 21), e(3, 4, 30)]);
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].legs.length, 2);
});

test("respects max length", () => {
  const ring = [e(1, 2, 1), e(2, 3, 2), e(3, 4, 3), e(4, 5, 4), e(5, 1, 5)];
  assert.equal(findCycles(ring, 4).length, 0);
  assert.equal(findCycles(ring, 5).length, 1);
});

test("keeps the best listing per pair", () => {
  const [c] = findCycles([e(1, 2, 10, 1), e(1, 2, 11, 7), e(2, 1, 20)]);
  assert.equal(c.legs[0].listingId, 11);
});

test("pickDisjoint never books a person twice and prefers short loops", () => {
  const cycles = findCycles([e(1, 2, 1), e(2, 1, 2), e(2, 3, 3), e(3, 1, 4)]);
  assert.equal(cycles.length, 2);
  const chosen = pickDisjoint(cycles);
  assert.equal(chosen.length, 1);
  assert.equal(chosen[0].legs.length, 2);
});

test("matchScore uses category, course code and keyword prefixes", () => {
  const book = { category: "textbooks", title: "General Chemistry, Tro 5th ed", description: "", course_code: "CH 101" };
  assert.ok(matchScore({ category: "textbooks", keywords: "chem", course_code: null }, book) > 0);
  assert.ok(matchScore({ category: "textbooks", keywords: "", course_code: "CH 101" }, book) >= 5);
  assert.equal(matchScore({ category: "textbooks", keywords: "", course_code: "MATH 125" }, book), 0);
  assert.equal(matchScore({ category: "dorm", keywords: "chem", course_code: null }, book), 0);
  assert.equal(matchScore({ category: "textbooks", keywords: "biology", course_code: null }, book), 0);
});

test("normalizeCourse", () => {
  assert.equal(normalizeCourse("ch101"), "CH 101");
  assert.equal(normalizeCourse(" math-125 "), "MATH 125");
  assert.equal(normalizeCourse("hello"), null);
});
