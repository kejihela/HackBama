<<<<<<< HEAD
# HackBama
=======
# CampusLoop

A multi-campus student marketplace (HackBama Track 01). Its distinguishing feature is **trade loops**: the matcher finds swap chains across campuses, like A → B → C → A, so no one needs cash.

## Run

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # Node 24 is installed here
npm install
npm run dev                                  # http://localhost:3000
```

The database (`data/market.db`) is created and seeded on first request. Run `npm run reset-db` to start over (stop the server first).
Subdomains work locally as well: http://ua.localhost:3000.

## Demo script

1. Open `/c/ua`, choose **Sign in with .edu**, and pick **Ana Reyes**. Demo mode shows the code on screen and offers one-click accounts.
2. Go to **Trade loops**. Add a want with the keywords "mini fridge" and the category Dorm gear. A 3-way cross-campus loop appears: Ana's chem book goes to Cara (Auburn), Cara's Iron Bowl ticket goes to Ben, and Ben's fridge goes to Ana.
3. Accept the loop as Ana. Then sign in as Ben (UA) and Cara (`/c/auburn/login`) and accept as each of them. The loop locks in and its chat opens.
4. **Game day** at `/c/ua/gameday` shows Auburn students' tickets, rides, and couches for the Iron Bowl.
5. **Launch a campus** at `/admin` (key `hackbama`). Georgia Tech goes live right away with its own theme and .edu login.
   The CLI does the same: `npm run add-campus -- gatech "Georgia Institute of Technology" "Georgia Tech" gatech.edu "#003057" "#B3A369"`

## Trust & safety

**Message safety screen** (`lib/safety.ts`). Every chat message is screened on the server before it's stored, so a modified client can't skip the check. Blocked messages are never delivered. The sender gets a caution for one of four categories:
- sexual content
- harassment or threats
- personal information (phone numbers, emails, addresses, room numbers, card numbers, requests for login codes)
- off-platform payment (Venmo, Zelle, gift cards, "skip escrow")

The screen also catches obfuscated spellings like `n u d e s` and `s3xy`. Each block is logged, and after 5 blocks in 24 hours messaging is paused.
- Try it: sign in as Maya, open her chat with Ben, and send "just venmo me" or "text me at 205-555-0143".

**AI moderation layer** (`lib/ai-moderation.ts`). Set `OPENAI_API_KEY` (default model `gpt-5.4-mini`) or `ANTHROPIC_API_KEY` (`claude-opus-5-5`) in `.env.local` to turn on the LLM classifier; `MODERATION_PROVIDER` picks one when both are set. It reviews chat messages and new listings in six categories: sexual, harassment, privacy, scam, prohibited items (weapons, ammunition, drugs…) and offensive content (hate speech, extremism, gore), whether or not the content is about a deal.
- **Order of checks.** The keyword rules run first. Certain matches, such as phone numbers, emails and card numbers, are blocked without a model call. Everything else goes to the model with the rule result as a hint, and its verdict is final.
- **What that adds over the rules.** The model clears keyword false positives ("I felt like an idiot for forgetting the charger") and catches what keywords can't: slang for ammunition, veiled threats, innuendo.
- **Precision.** Only a high-confidence "block" stops a message. Medium-confidence calls are delivered and queued under "Needs a look" in the safety log.
- **Output and model.** Responses use strict JSON-schema structured output at low reasoning effort, and model refusals are treated as blocks.
- **Failure handling.** One 4-second attempt. On timeout, rate limit or any error, the rules decide, so chat never depends on the model being up. Identical texts are cached.

**CampusLoop Protect escrow** (`lib/escrow.ts`). The flow works like Upwork:
1. The buyer pays into escrow. The listing comes off the market.
2. Buyer and seller meet, and the buyer inspects the item.
3. The buyer releases the payment, or opens a dispute that freezes it. A moderator then refunds the buyer or pays the seller.

If the buyer never responds, the payment auto-releases after 7 days. Every step goes into an audit trail. Payments are simulated in demo mode; production would use Stripe Connect with held funds.
- Try it: buy the TI-84 as Maya and release the payment. Then resolve the seeded mattress-topper dispute in the console.

**Listing verification** (`lib/verification.ts`). Before a listing goes live:
- Prohibited items are rejected: drugs, vapes, weapons, alcohol, fake IDs, test banks and counterfeits.
- Unsafe or personal text is rejected.
- The price is checked against similar CampusLoop listings, then a table of typical used prices, then a band for the category. Overpriced or suspiciously cheap items go to a moderator.

The sell form shows the price check live as the seller types. Approved listings carry a "✓ Fair price" badge.

**Moderator console**: `/admin` (key `hackbama`) has four tabs: Escrow disputes, Listing review, Safety log and Campuses.

## Architecture

- **One deployment, many tenants.** Every row carries `tenant_id`. `middleware.ts` maps `ua.campusloop.app` to `/c/ua`, and adding a school only means inserting a row.
- **Isolation.** One visibility rule (`lib/queries.ts`, `VISIBLE`) governs every listing read. Students see their own campus plus anything other schools shared to the network. On Postgres this becomes an RLS policy.
- **Campus-verified.** Login uses a one-time code sent to an email whose domain matches `tenants.email_domains`. Set `RESEND_API_KEY` to send real email.
- **Customization per school.** Colors, mascot, categories, and safe meetup spots live in the tenant row.
- **Trade loops.** `lib/cycles.ts` is a pure module covered by unit tests (`npm test`). It enumerates cycles of length 2–4 Johnson-style, then picks a set of loops that share no person. It reruns whenever someone lists or wants something.
- **Stack.** Next.js 15 (App Router, server actions) with SQLite through better-sqlite3. The schema in `lib/schema.sql` ports directly to Postgres.

## Deploying to Vercel

Production needs three things the local setup gets from your disk:

| Need | Service | Environment variables |
|---|---|---|
| Database | Turso (hosted libSQL/SQLite) | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` |
| Photo uploads | Vercel Blob | `BLOB_READ_WRITE_TOKEN` |
| AI moderation | OpenAI | `OPENAI_API_KEY`, `MODERATION_PROVIDER=openai`, `MODERATION_MODEL=gpt-5.4-mini` |

Also set `ADMIN_KEY` to a long random value (the demo key `hackbama` is public in this README).

1. `npx vercel login`, then `npx vercel link` in this folder.
2. In the Vercel dashboard, open the project's **Storage** tab. Add **Turso** (Marketplace) and **Blob**, and connect both to the project. Their environment variables are added automatically.
3. Add the OpenAI and admin variables with `npx vercel env add <NAME> production`.
4. Run `npx vercel deploy --prod`. The first request creates the tables and seeds the demo data.

Without a database URL, the app falls back to the local file `data/market.db`.
>>>>>>> b4253a7 (First commit)
