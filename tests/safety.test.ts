import { test } from "node:test";
import assert from "node:assert/strict";
import { screenText, normalize } from "../lib/safety.ts";

const cat = (s: string) => {
  const r = screenText(s);
  return r.ok ? "ok" : r.category;
};

test("normal marketplace chat passes", () => {
  for (const s of [
    "Hi! Is your mini fridge still available?",
    "Can we meet at Ferguson Student Center at 3pm tomorrow?",
    "Would you take $55? It's for my Tutwiler room.",
    "This calculator is so hot right now lol, everyone wants one",
    "I'm taking Human Sexuality next term, is the textbook still for sale?",
    "Sounds good, see you at the Gorgas Library steps",
    "The book is $45, or I'd trade it for a desk chair",
  ]) {
    assert.equal(cat(s), "ok", s);
  }
});

test("blocks sexual content, including obfuscated spellings", () => {
  assert.equal(cat("send nudes"), "sexual");
  assert.equal(cat("you're so hot, come over tonight alone"), "sexual");
  assert.equal(cat("n u d e s?"), "sexual");
  assert.equal(cat("s3xy pics?"), "sexual");
  assert.equal(cat("you can pay with your body"), "sexual");
});

test("blocks harassment and threats", () => {
  assert.equal(cat("you're an idiot"), "harassment");
  assert.equal(cat("I know where you live"), "harassment");
  assert.equal(cat("f*ck you"), "harassment");
  assert.equal(cat("kys"), "harassment");
});

test("blocks personal information", () => {
  assert.equal(cat("text me at 205-555-0143"), "privacy");
  assert.equal(cat("my email is jane.doe@gmail.com"), "privacy");
  assert.equal(cat("come to 1204 Paul Bryant Drive"), "privacy");
  assert.equal(cat("I'm in room 412"), "privacy");
  assert.equal(cat("what's your login code?"), "privacy");
  assert.equal(cat("card 4242 4242 4242 4242"), "privacy");
});

test("blocks off-platform payment", () => {
  assert.equal(cat("just venmo me"), "scam");
  assert.equal(cat("can you pay with gift cards"), "scam");
  assert.equal(cat("let's skip the escrow"), "scam");
});

test("prices and course numbers are not phone numbers", () => {
  assert.equal(cat("$150 for the ticket, CH 101 book is $45"), "ok");
  assert.equal(cat("We play at 2:30, leaving at 1pm, 3 seats"), "ok");
});

test("normalize", () => {
  assert.equal(normalize("S.E.X.Y"), "sexy");
  assert.equal(normalize("h0rny"), "horny");
});
