// Usage: npm run add-campus -- gatech "Georgia Institute of Technology" "Georgia Tech" gatech.edu "#003057" "#B3A369"
// Uses TURSO_DATABASE_URL / TURSO_AUTH_TOKEN when set, otherwise the local data/market.db.
// The app creates the schema on first start, so run it once before using this script.
import { createClient } from "@libsql/client";
import path from "node:path";

const [id, name, short, domains, primary = "#333333", accent = "#999999"] = process.argv.slice(2);
if (!id || !name || !short || !domains) {
  console.error('Usage: npm run add-campus -- <slug> "<Full name>" "<Short name>" <domain[,domain]> [#primary] [#accent]');
  process.exit(1);
}
const db = createClient(
  process.env.TURSO_DATABASE_URL
    ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: `file:${path.join("data", "market.db")}` },
);
const cats = ["textbooks", "dorm", "lab", "tickets", "tutoring", "rides", "housing", "other"];
await db.execute({
  sql: `INSERT INTO tenants (id, name, short_name, mascot, city, email_domains, primary_color, accent_color, categories, meetup_spots, allow_network, created_at)
        VALUES (?, ?, ?, '', '', ?, ?, ?, ?, ?, 1, ?)`,
  args: [id, name, short, JSON.stringify(domains.split(",")), primary, accent, JSON.stringify(cats), JSON.stringify(["Student center, main entrance"]), Date.now()],
});
console.log(`✓ ${short} is live at /c/${id}`);
