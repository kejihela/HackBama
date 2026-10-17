export type CategoryKey =
  | "textbooks"
  | "dorm"
  | "lab"
  | "tickets"
  | "tutoring"
  | "rides"
  | "housing"
  | "other";

export const CATEGORIES: { key: CategoryKey; label: string; hint: string }[] = [
  { key: "textbooks", label: "Textbooks", hint: "Matched to course codes" },
  { key: "dorm", label: "Dorm gear", hint: "Fridges, rugs, lamps, futons" },
  { key: "lab", label: "Lab supplies", hint: "Goggles, coats, calculators, kits" },
  { key: "tickets", label: "Tickets", hint: "Games, concerts, formals" },
  { key: "tutoring", label: "Tutoring", hint: "Sessions by the hour" },
  { key: "rides", label: "Rides", hint: "Airport, home, away games" },
  { key: "housing", label: "Game-day stays", hint: "Couches and guest rooms for visitors" },
  { key: "other", label: "Other", hint: "Anything else" },
];

export const ALL_CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

export function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? "Anything";
}

/** Categories that light up on game day for visiting students. */
export const GAMEDAY_CATEGORIES: CategoryKey[] = ["tickets", "rides", "housing"];
