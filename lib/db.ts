import { createClient, type Client, type InArgs, type InValue, type Transaction } from "@libsql/client";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";
import { seed, seedTrustHistory } from "./seed";

// Database: libSQL. Locally it's the SQLite file data/market.db. In production set
// TURSO_DATABASE_URL + TURSO_AUTH_TOKEN and the same code talks to a hosted Turso database,
// which is what makes it work on Vercel, where the filesystem isn't persistent.
//
// The API mirrors better-sqlite3's prepare().get/all/run, but every call returns a promise.

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

type Row = Record<string, unknown>;
type Args = InValue[] | [Record<string, InValue | undefined>];

const globalForDb = globalThis as unknown as { __campusloop?: { client: Client; ready: Promise<void> } };
const txStore = new AsyncLocalStorage<Transaction>();

function connect() {
  const remote = process.env.TURSO_DATABASE_URL;
  if (!remote) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const client = createClient(
    remote
      ? { url: remote, authToken: process.env.TURSO_AUTH_TOKEN }
      : { url: `file:${process.env.DATABASE_PATH ?? path.join(DATA_DIR, "market.db")}` },
  );
  const ready = (async () => {
    if (!remote) await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA foreign_keys = ON");
    await client.executeMultiple(SCHEMA_SQL);
    await migrate(client);
    const { rows } = await client.execute("SELECT COUNT(*) AS n FROM tenants");
    if (Number(rows[0][0]) === 0) await seed();
    await seedTrustHistory();
  })();
  // If setup fails, let the next request retry instead of caching the failure forever.
  ready.catch(() => {
    globalForDb.__campusloop = undefined;
  });
  return { client, ready };
}

function state() {
  globalForDb.__campusloop ??= connect();
  return globalForDb.__campusloop;
}

/** Adds columns introduced after a database was first created. */
async function migrate(client: Client) {
  const cols = async (table: string) =>
    new Set((await client.execute(`PRAGMA table_info(${table})`)).rows.map((r) => String(r[1])));
  const listing = await cols("listings");
  for (const [name, type] of [
    ["price_check", "TEXT"],
    ["price_low", "INTEGER"],
    ["price_high", "INTEGER"],
    ["price_basis", "TEXT"],
    ["review_note", "TEXT"],
  ]) {
    if (!listing.has(name)) await client.execute(`ALTER TABLE listings ADD COLUMN ${name} ${type}`);
  }
  const tenants = await cols("tenants");
  if (!tenants.has("logo")) {
    await client.execute("ALTER TABLE tenants ADD COLUMN logo TEXT");
    // Databases seeded before logos existed: give the demo campuses theirs.
    await client.execute("UPDATE tenants SET logo = '/logos/' || id || '.svg' WHERE id IN ('ua','auburn','uga') AND logo IS NULL");
  }
  const done = await client.execute("SELECT 1 FROM meta WHERE key = 'category_vehicles_v1'");
  if (!done.rows.length) {
    const ts = await client.execute("SELECT id, categories FROM tenants");
    for (const r of ts.rows) {
      const cats = JSON.parse(String(r[1])) as string[];
      if (!cats.includes("vehicles")) {
        cats.splice(Math.max(0, cats.indexOf("rides") + 1), 0, "vehicles");
        await client.execute({ sql: "UPDATE tenants SET categories = ? WHERE id = ?", args: [JSON.stringify(cats), String(r[0])] });
      }
    }
    await client.execute({ sql: "INSERT OR IGNORE INTO meta (key, value) VALUES ('category_vehicles_v1', ?)", args: [String(Date.now())] });
  }
  const flags = await cols("safety_flags");
  if (!flags.has("action")) await client.execute("ALTER TABLE safety_flags ADD COLUMN action TEXT NOT NULL DEFAULT 'blocked'");
  if (!flags.has("source")) await client.execute("ALTER TABLE safety_flags ADD COLUMN source TEXT NOT NULL DEFAULT 'rules'");
}

function toArgs(sql: string, args: Args): InArgs {
  if (args.length === 1 && args[0] !== null && typeof args[0] === "object" && !(args[0] instanceof Uint8Array) && !(args[0] instanceof Date)) {
    // Named parameters. Hosted Turso rejects keys the SQL doesn't reference (a local file ignores them),
    // so pass only the ones that appear as @name, and turn undefined into null.
    const used = new Set([...sql.matchAll(/[@:$]([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
    return Object.fromEntries(
      Object.entries(args[0] as Record<string, InValue | undefined>)
        .filter(([k]) => used.has(k))
        .map(([k, v]) => [k, v ?? null]),
    );
  }
  return args as InValue[];
}

async function execute(sql: string, args: Args) {
  const tx = txStore.getStore();
  if (tx) return tx.execute({ sql, args: toArgs(sql, args) });
  const s = state();
  await s.ready;
  return s.client.execute({ sql, args: toArgs(sql, args) });
}

class Statement {
  constructor(private sql: string) {}

  async get(...args: Args): Promise<Row | undefined> {
    const rs = await execute(this.sql, args);
    if (!rs.rows.length) return undefined;
    return Object.fromEntries(rs.columns.map((c, i) => [c, rs.rows[0][i]]));
  }

  async all(...args: Args): Promise<Row[]> {
    const rs = await execute(this.sql, args);
    return rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));
  }

  async run(...args: Args): Promise<{ changes: number; lastInsertRowid: number }> {
    const rs = await execute(this.sql, args);
    return { changes: rs.rowsAffected, lastInsertRowid: Number(rs.lastInsertRowid ?? 0) };
  }
}

export const db = () => ({
  prepare: (sql: string) => new Statement(sql),
});

/**
 * Runs fn inside a write transaction. Every db() call made inside it (even in helper functions)
 * goes through the transaction, so it commits or rolls back as one unit.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn(); // already inside one
  const s = state();
  await s.ready;
  const tx = await s.client.transaction("write");
  try {
    const out = await txStore.run(tx, fn);
    await tx.commit();
    return out;
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  } finally {
    tx.close();
  }
}

/** Same as transaction(), for seeding before `ready` resolves. */
export async function seedTransaction(fn: () => Promise<void>) {
  const tx = await state().client.transaction("write");
  try {
    await txStore.run(tx, fn);
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  } finally {
    tx.close();
  }
}

export const now = () => Date.now();
