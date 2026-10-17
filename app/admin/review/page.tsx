import { listingsAwaitingReview } from "@/lib/moderation";
import { categoryLabel } from "@/lib/categories";
import { listTenants } from "@/lib/tenant";
import { money, timeAgo } from "@/lib/format";
import { ListingTile } from "@/components/ListingTile";
import { reviewListingAction } from "../actions";

export default async function ReviewQueue() {
  const rows = await listingsAwaitingReview();
  const tenants = new Map((await listTenants()).map((t) => [t.id, t]));
  return (
    <main className="wrap page stack-lg">
      <div className="stack" style={{ gap: 6 }}>
        <span className="mono">Product &amp; price verification</span>
        <h1>Listing review</h1>
        <p className="muted" style={{ maxWidth: 640 }}>
          Listings whose price fell outside the reasonable range. Overpriced items might be rare or new. Suspiciously cheap ones are a common scam pattern.
        </p>
      </div>
      {rows.length === 0 && <div className="empty">The queue is empty.</div>}
      {rows.map((l) => {
        const t = tenants.get(l.tenant_id)!;
        const over = l.price_check === "high";
        return (
          <article key={l.id} className="panel" style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 20 }}>
            <div style={{ borderRadius: 10, overflow: "hidden" }}>
              <ListingTile image={l.image} category={l.category} color={t.primary_color} />
            </div>
            <div className="stack">
              <div className="row between">
                <span className="mono">{t.short_name} · {categoryLabel(l.category)} · {l.seller_name} · {timeAgo(l.created_at)}</span>
                <span className={`badge ${over ? "warn" : "status-disputed"}`}>{over ? "Above typical range" : "Suspiciously low"}</span>
              </div>
              <h3>{l.title}</h3>
              {l.description && <p className="small muted">{l.description}</p>}
              <div className="price-gauge">
                <div>
                  <span className="faint small">Asking</span>
                  <b className="price">{money(l.price_cents)}</b>
                </div>
                <div>
                  <span className="faint small">Reasonable range</span>
                  <b>{money(l.price_low)}–{money(l.price_high)}</b>
                </div>
                <div style={{ flex: 2 }}>
                  <span className="faint small">Based on</span>
                  <span className="small">{l.price_basis}</span>
                </div>
              </div>
              <form action={reviewListingAction} className="stack">
                <input type="hidden" name="listing" value={l.id} />
                <input name="note" className="input" placeholder="Note to the seller (optional)" />
                <div className="row">
                  <button className="btn btn-ok" name="decision" value="approve">Approve and publish</button>
                  <button className="btn" name="decision" value="reject">Reject</button>
                </div>
              </form>
            </div>
          </article>
        );
      })}
    </main>
  );
}
