import { db, now } from "./db";
import { ALL_CATEGORY_KEYS } from "./categories";

export type Tenant = {
  id: string;
  name: string;
  short_name: string;
  mascot: string;
  city: string;
  email_domains: string[];
  primary_color: string;
  accent_color: string;
  categories: string[];
  meetup_spots: string[];
  allow_network: boolean;
};

type TenantRow = Omit<Tenant, "email_domains" | "categories" | "meetup_spots" | "allow_network"> & {
  email_domains: string;
  categories: string;
  meetup_spots: string;
  allow_network: number;
};

function hydrate(row: TenantRow): Tenant {
  return {
    ...row,
    email_domains: JSON.parse(row.email_domains),
    categories: JSON.parse(row.categories),
    meetup_spots: JSON.parse(row.meetup_spots),
    allow_network: !!row.allow_network,
  };
}

export async function getTenant(id: string): Promise<Tenant | null> {
  const row = (await db().prepare("SELECT * FROM tenants WHERE id = ?").get(id)) as TenantRow | undefined;
  return row ? hydrate(row) : null;
}

export async function listTenants(): Promise<Tenant[]> {
  return ((await db().prepare("SELECT * FROM tenants ORDER BY created_at").all()) as TenantRow[]).map(hydrate);
}

/** Finds the school an email belongs to, matching the domain or any parent domain. */
export async function tenantForEmail(email: string): Promise<Tenant | null> {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) return null;
  for (const t of await listTenants()) {
    if (t.email_domains.some((d) => domain === d || domain.endsWith("." + d))) return t;
  }
  return null;
}

export type NewTenantInput = {
  id: string;
  name: string;
  short_name: string;
  mascot?: string;
  city?: string;
  email_domains: string[];
  primary_color: string;
  accent_color: string;
  meetup_spots?: string[];
  categories?: string[];
};

export const SLUG_RE = /^[a-z][a-z0-9-]{1,30}$/;
export const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
export const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

export async function validateTenant(input: NewTenantInput): Promise<string | null> {
  if (!SLUG_RE.test(input.id)) return "Slug must be lowercase letters, digits or dashes (2-31 chars).";
  if (["admin", "api", "www", "c"].includes(input.id)) return "That slug is reserved.";
  if (!input.name.trim() || !input.short_name.trim()) return "Name and short name are required.";
  if (input.email_domains.length === 0) return "Add at least one email domain.";
  const bad = input.email_domains.find((d) => !DOMAIN_RE.test(d));
  if (bad) return `"${bad}" is not a valid domain.`;
  if (!COLOR_RE.test(input.primary_color) || !COLOR_RE.test(input.accent_color))
    return "Colors must be hex values like #9E1B32.";
  if (await getTenant(input.id)) return "A campus with that slug already exists.";
  const taken = (await listTenants()).find((t) => t.email_domains.some((d) => input.email_domains.includes(d)));
  if (taken) return `That email domain already belongs to ${taken.short_name}.`;
  return null;
}

export async function createTenant(input: NewTenantInput): Promise<Tenant> {
  await db()
    .prepare(
      `INSERT INTO tenants (id, name, short_name, mascot, city, email_domains, primary_color, accent_color,
                            categories, meetup_spots, allow_network, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(
      input.id,
      input.name.trim(),
      input.short_name.trim(),
      input.mascot?.trim() ?? "",
      input.city?.trim() ?? "",
      JSON.stringify(input.email_domains),
      input.primary_color,
      input.accent_color,
      JSON.stringify(input.categories?.length ? input.categories : ALL_CATEGORY_KEYS),
      JSON.stringify(input.meetup_spots?.length ? input.meetup_spots : ["Student union, main entrance"]),
      now(),
    );
  return (await getTenant(input.id))!;
}

export { onColor } from "./format";
