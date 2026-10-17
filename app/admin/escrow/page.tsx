import Link from "next/link";
import { escrowTotals, orderEvents, ordersForModeration } from "@/lib/escrow";
import { money, timeAgo, ORDER_STATUS_LABEL } from "@/lib/format";
import { ListingTile } from "@/components/ListingTile";
import { resolveDisputeAction } from "../actions";

export default async function EscrowConsole({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const totals = await escrowTotals();
  const orders = await ordersForModeration();
  const disputed = orders.filter((o) => o.status === "disputed");
  const held = orders.filter((o) => o.status === "held");
  const eventsByOrder = new Map(await Promise.all(disputed.map(async (o) => [o.id, await orderEvents(o.id)] as const)));
  const closed = orders.filter((o) => o.status === "released" || o.status === "refunded").slice(0, 20);

  return (
    <main className="wrap page stack-lg">
      <div className="stack" style={{ gap: 6 }}>
        <span className="mono">Middleman · CampusLoop Protect</span>
        <h1>Escrow</h1>
        <p className="muted" style={{ maxWidth: 640 }}>
          CampusLoop holds buyers&apos; payments until they confirm the item. When a buyer disputes, you decide: release to the seller, or refund the buyer.
        </p>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="stat-row">
        <div className="stat"><b>{money(totals.held)}</b><span className="faint small">held right now</span></div>
        <div className="stat"><b>{totals.disputes}</b><span className="faint small">open disputes</span></div>
        <div className="stat"><b>{money(totals.released)}</b><span className="faint small">released to sellers</span></div>
        <div className="stat"><b>{money(totals.fees)}</b><span className="faint small">protection fees earned</span></div>
      </div>

      <section className="stack">
        <h2>Disputes</h2>
        {disputed.length === 0 && <div className="empty">No open disputes.</div>}
        {disputed.map((o) => (
          <article key={o.id} className="panel" style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 20 }}>
            <div style={{ borderRadius: 10, overflow: "hidden" }}>
              <ListingTile image={o.listing_image} category={o.listing_category} color={o.tenant_color} />
            </div>
            <div className="stack">
              <div className="row between">
                <span className="mono">Order #{o.id} · {timeAgo(o.created_at)}</span>
                <span className="badge status-disputed">In dispute · {money(o.amount_cents + o.fee_cents)} frozen</span>
              </div>
              <h3>
                <Link href={`/c/${o.listing_tenant}/listing/${o.listing_id}`} style={{ textDecoration: "underline" }}>{o.listing_title}</Link>
              </h3>
              <p className="small">
                <b>{o.buyer_name}</b> bought from <b>{o.seller_name}</b> for {money(o.amount_cents)}
              </p>
              <blockquote className="quote">“{o.dispute_reason}”</blockquote>
              <details>
                <summary className="small" style={{ cursor: "pointer" }}>Audit trail</summary>
                <ol className="timeline" style={{ marginTop: 8 }}>
                  {(eventsByOrder.get(o.id) ?? []).map((e) => (
                    <li key={e.id}><b>{e.action}</b> <span className="faint small">· {e.actor} · {timeAgo(e.created_at)}</span>{e.note && <p className="small muted">{e.note}</p>}</li>
                  ))}
                </ol>
              </details>
              <form action={resolveDisputeAction} className="stack">
                <input type="hidden" name="order" value={o.id} />
                <input name="note" className="input" placeholder="Decision note shown to both students (optional)" />
                <div className="row">
                  <button className="btn btn-ink" name="decision" value="refund">Refund {o.buyer_name.split(" ")[0]} in full</button>
                  <button className="btn" name="decision" value="release">Release {money(o.amount_cents)} to {o.seller_name.split(" ")[0]}</button>
                </div>
              </form>
            </div>
          </article>
        ))}
      </section>

      <section className="stack">
        <h2>Held, waiting for inspection</h2>
        {held.length === 0 ? <div className="empty">Nothing held.</div> : (
          <div className="panel" style={{ padding: 0 }}>
            {held.map((o) => (
              <div key={o.id} className="thread-row">
                <span style={{ flex: 1 }}><b>{o.listing_title}</b> <span className="faint small">· {o.buyer_name} → {o.seller_name}</span></span>
                <span className="small faint">auto-releases in {Math.max(0, Math.ceil((o.auto_release_at - Date.now()) / 86400_000))}d</span>
                <b>{money(o.amount_cents + o.fee_cents)}</b>
              </div>
            ))}
          </div>
        )}
      </section>

      {closed.length > 0 && (
        <section className="stack">
          <h2>Recently closed</h2>
          <div className="panel" style={{ padding: 0 }}>
            {closed.map((o) => (
              <div key={o.id} className="thread-row">
                <span style={{ flex: 1 }}><b>{o.listing_title}</b> <span className="faint small">· {o.buyer_name} → {o.seller_name}</span></span>
                <span className={`badge status-${o.status}`}>{ORDER_STATUS_LABEL[o.status]}</span>
                <b>{money(o.amount_cents)}</b>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
