// The CampusLoop schema. Plain SQLite / libSQL; every row that belongs to a school carries tenant_id.
// Kept as a TS string (not a .sql file) so it is bundled into serverless functions on Vercel.
export const SCHEMA_SQL = `
-- CampusLoop schema. Every row that belongs to a school carries tenant_id.
-- Written for SQLite; maps 1:1 onto Postgres (TEXT/INTEGER/JSON columns, RLS on tenant_id).

CREATE TABLE IF NOT EXISTS tenants (
  id              TEXT PRIMARY KEY,           -- slug, also the subdomain: ua.campusloop.app
  name            TEXT NOT NULL,              -- "The University of Alabama"
  short_name      TEXT NOT NULL,              -- "Alabama"
  mascot          TEXT NOT NULL DEFAULT '',
  city            TEXT NOT NULL DEFAULT '',
  email_domains   TEXT NOT NULL,              -- JSON array: ["ua.edu","crimson.ua.edu"]
  primary_color   TEXT NOT NULL,
  accent_color    TEXT NOT NULL,
  categories      TEXT NOT NULL,              -- JSON array of enabled category keys
  meetup_spots    TEXT NOT NULL,              -- JSON array of safe exchange spots
  allow_network   INTEGER NOT NULL DEFAULT 1, -- participates in cross-campus browsing
  logo            TEXT,                       -- /logos/<id>.svg or an https URL; null = generic mark
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS users_tenant ON users(tenant_id);

CREATE TABLE IF NOT EXISTS login_codes (
  email       TEXT PRIMARY KEY,
  code        TEXT NOT NULL,
  tenant_id   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  expires_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  seller_id    INTEGER NOT NULL REFERENCES users(id),
  category     TEXT NOT NULL,
  mode         TEXT NOT NULL DEFAULT 'sell',   -- sell | trade | both
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price_cents  INTEGER,                        -- null when trade-only
  course_code  TEXT,                           -- normalized, e.g. "CH 101"
  image        TEXT,                           -- uploaded file name
  visibility   TEXT NOT NULL DEFAULT 'campus', -- campus | network
  status       TEXT NOT NULL DEFAULT 'active', -- active | review | rejected | pending (in escrow) | traded | sold
  price_check  TEXT,                           -- fair | high | low | free | manual (moderator approved)
  price_low    INTEGER,
  price_high   INTEGER,
  price_basis  TEXT,
  review_note  TEXT,                           -- why it was held or rejected
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS listings_tenant_created ON listings(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_network ON listings(visibility, status, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_course ON listings(course_code);

CREATE TABLE IF NOT EXISTS wants (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  category     TEXT NOT NULL,                  -- category key or 'any'
  keywords     TEXT NOT NULL DEFAULT '',
  course_code  TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS wants_user ON wants(user_id);

-- A trade loop: A gives to B, B gives to C, C gives to A. No money changes hands.
CREATE TABLE IF NOT EXISTS trade_cycles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  signature   TEXT NOT NULL UNIQUE,            -- sorted listing ids, dedupes rediscovery
  status      TEXT NOT NULL DEFAULT 'proposed',-- proposed | completed | declined | void
  score       INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_legs (
  cycle_id     INTEGER NOT NULL REFERENCES trade_cycles(id),
  position     INTEGER NOT NULL,
  listing_id   INTEGER NOT NULL REFERENCES listings(id),
  giver_id     INTEGER NOT NULL REFERENCES users(id),
  receiver_id  INTEGER NOT NULL REFERENCES users(id),
  accepted     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cycle_id, position)
);
CREATE INDEX IF NOT EXISTS trade_legs_giver ON trade_legs(giver_id);
CREATE INDEX IF NOT EXISTS trade_legs_receiver ON trade_legs(receiver_id);

-- Conversation about a listing (buyer <-> seller) or a trade loop (all members).
CREATE TABLE IF NOT EXISTS threads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  INTEGER REFERENCES listings(id),
  cycle_id    INTEGER REFERENCES trade_cycles(id),
  buyer_id    INTEGER REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  UNIQUE (listing_id, buyer_id),
  UNIQUE (cycle_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id   INTEGER NOT NULL REFERENCES threads(id),
  sender_id   INTEGER NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages(thread_id, id);

-- Game days: when the away school's students travel, the host campus marketplace opens to them.
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  home_tenant  TEXT NOT NULL REFERENCES tenants(id),
  away_tenant  TEXT NOT NULL REFERENCES tenants(id),
  starts_at    INTEGER NOT NULL
);

-- Escrow: CampusLoop holds the buyer's payment until they inspect the item and release it.
CREATE TABLE IF NOT EXISTS orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id       INTEGER NOT NULL REFERENCES listings(id),
  buyer_id         INTEGER NOT NULL REFERENCES users(id),
  seller_id        INTEGER NOT NULL REFERENCES users(id),
  amount_cents     INTEGER NOT NULL,            -- goes to the seller on release
  fee_cents        INTEGER NOT NULL,            -- buyer-protection fee kept by CampusLoop
  status           TEXT NOT NULL DEFAULT 'held',-- held | disputed | released | refunded
  dispute_reason   TEXT,
  resolution_note  TEXT,
  auto_release_at  INTEGER NOT NULL,            -- released automatically if the buyer never responds
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS orders_seller ON orders(seller_id);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);

-- Append-only audit trail for every escrow action (who did what, when).
CREATE TABLE IF NOT EXISTS order_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id),
  actor       TEXT NOT NULL,                    -- buyer | seller | moderator | system
  action      TEXT NOT NULL,
  note        TEXT,
  created_at  INTEGER NOT NULL
);

-- Messages and listings the safety screen blocked, for moderators and strike counting.
CREATE TABLE IF NOT EXISTS safety_flags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  context     TEXT NOT NULL,                    -- message | listing
  thread_id   INTEGER,
  category    TEXT NOT NULL,
  reason      TEXT NOT NULL,
  excerpt     TEXT NOT NULL,
  action      TEXT NOT NULL DEFAULT 'blocked', -- blocked | review (delivered, but a moderator should look)
  source      TEXT NOT NULL DEFAULT 'rules',   -- rules | ai | rules-fallback
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS safety_flags_user ON safety_flags(user_id, created_at);
`;
