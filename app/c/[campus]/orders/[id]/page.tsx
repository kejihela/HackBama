import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { getOrder, orderEvents } from "@/lib/escrow";
import { getTenant } from "@/lib/tenant";
import { openListingThread } from "@/lib/queries";
import { money, timeAgo, ORDER_STATUS_LABEL as STATUS_LABEL } from "@/lib/format";
import { ListingTile } from "@/components/ListingTile";
import { orderAction } from "../../actions";

type Props = { params: Promise<{ campus: string; id: string }>; searchParams: Promise<{ paid?: string; done?: string; error?: string }> };

export default async function OrderPage({ params, searchParams }: Props) {
  const { campus, id } = await params;
  const sp = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect(`/c/${campus}/login?next=/c/${campus}/orders/${id}`);
  const o = await getOrder(Number(id));
  if (!o || (o.buyer_id !== viewer.id && o.seller_id !== viewer.id)) notFound();
  const role = o.buyer_id === viewer.id ? "buyer" : "seller";
  const events = await orderEvents(o.id);
  const thread = await openListingThread(o.listing_id, o.buyer_id);
  const spots = (await getTenant(o.listing_tenant))!.meetup_spots;
  const daysLeft = Math.max(0, Math.ceil((o.auto_release_at - Date.now()) / 86400_000));
  const closed = o.status === "released" || o.status === "refunded";
  const track = [
    { label: "Paid into escrow", state: "done" },
    { label: o.status === "disputed" ? "Moderator reviewing" : "Meet & inspect", state: closed ? "done" : "now" },
    { label: o.status === "refunded" ? "Buyer refunded" : "Seller paid", state: closed ? "done" : "" },
  ];

  return (
    <main className="wrap page stack-lg" style={{ maxWidth: 860 }}>
      <Link href={`/c/${campus}/orders`} className="faint small">← Orders &amp; wallet</Link>
      {sp.paid && <div className="alert success" style={{ fontSize: 15 }}><b>Payment held.</b> {money(o.amount_cents + o.fee_cents)} is in CampusLoop escrow. Meet the seller, check the item, then release it.</div>}
      {sp.done === "release" && <div className="alert success"><b>Payment released.</b> {o.seller_name.split(" ")[0]} has been paid. Thanks for using CampusLoop Protect.</div>}
      {sp.done === "dispute" && <div className="alert info"><b>Dispute opened.</b> The payment stays frozen while a CampusLoop moderator reviews it, usually within 24 hours.</div>}
      {sp.done === "cancel" && <div className="alert info">Sale cancelled. The buyer has been refunded in full and your listing is back on the market.</div>}
      {sp.error && <div className="alert error">{sp.error}</div>}

      <div className="row between">
        <div className="stack" style={{ gap: 4 }}>
          <span className="mono">Order #{o.id} · you&apos;re the {role}</span>
          <h1 style={{ fontSize: 30 }}>{o.listing_title}</h1>
        </div>
        <span className={`badge status-${o.status}`} style={{ fontSize: 13, padding: "6px 12px" }}>{STATUS_LABEL[o.status]}</span>
      </div>

      <div className="escrow-track">
        {track.map((t, i) => (
          <div key={t.label} className={`track-step ${t.state}`}>
            <span className="dot">{t.state === "done" ? "✓" : i + 1}</span>
            <span className="small"><b>{t.label}</b></span>
          </div>
        ))}
      </div>

      <div className="detail" style={{ gridTemplateColumns: "1fr 1.3fr" }}>
        <div className="stack">
          <Link href={`/c/${campus}/listing/${o.listing_id}`} style={{ borderRadius: 14, overflow: "hidden" }}>
            <ListingTile image={o.listing_image} category={o.listing_category} color={o.tenant_color} />
          </Link>
          <dl className="kv panel">
            <dt>Buyer</dt><dd>{o.buyer_name}</dd>
            <dt>Seller</dt><dd>{o.seller_name}</dd>
            <dt>Item price</dt><dd>{money(o.amount_cents)}</dd>
            <dt>Protection fee</dt><dd>{money(o.fee_cents)}</dd>
            <dt>Held by CampusLoop</dt><dd>{money(o.amount_cents + o.fee_cents)}</dd>
          </dl>
          <Link href={`/c/${campus}/messages/${thread}`} className="btn">Message {role === "buyer" ? "seller" : "buyer"}</Link>
        </div>

        <div className="stack-lg">
          {role === "buyer" && o.status === "held" && (
            <>
              <div className="panel stack">
                <h3>At the meetup, check that:</h3>
                <ul className="checklist">
                  <li>It&apos;s the item in the photos and description</li>
                  <li>It works: power it on, flip through the pages, test the zipper</li>
                  <li>There&apos;s no damage that wasn&apos;t mentioned</li>
                  <li>You&apos;re meeting somewhere public: {spots.slice(0, 2).join(" or ")}</li>
                </ul>
                <form action={orderAction} className="stack">
                  <input type="hidden" name="campus" value={campus} />
                  <input type="hidden" name="order" value={o.id} />
                  <label className="row small" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
                    <input type="checkbox" required style={{ marginTop: 3 }} />
                    <span>I&apos;ve inspected the item and it meets my expectations.</span>
                  </label>
                  <button className="btn btn-ok btn-lg" name="action" value="release">Release {money(o.amount_cents)} to {o.seller_name.split(" ")[0]}</button>
                </form>
                <p className="faint small">If you don&apos;t respond, the payment is released automatically in {daysLeft} day{daysLeft === 1 ? "" : "s"}.</p>
              </div>
              <details className="panel">
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>Something wrong? Ask the middleman to step in</summary>
                <form action={orderAction} className="stack" style={{ marginTop: 12 }}>
                  <input type="hidden" name="campus" value={campus} />
                  <input type="hidden" name="order" value={o.id} />
                  <textarea name="reason" className="textarea" required minLength={10} placeholder="What doesn't match the listing? Damage, missing parts, wrong edition…" />
                  <button className="btn" name="action" value="dispute">Open a dispute and freeze the payment</button>
                </form>
              </details>
            </>
          )}

          {role === "buyer" && o.status === "disputed" && (
            <div className="panel stack">
              <h3>A moderator is reviewing your dispute</h3>
              <p className="muted small">“{o.dispute_reason}”</p>
              <p className="small">The payment stays frozen until the moderator decides: refund you, or release it to the seller. Sorted it out with the seller yourselves?</p>
              <form action={orderAction}>
                <input type="hidden" name="campus" value={campus} />
                <input type="hidden" name="order" value={o.id} />
                <button className="btn btn-ok" name="action" value="release">We resolved it. Release payment</button>
              </form>
            </div>
          )}

          {role === "seller" && o.status === "held" && (
            <div className="panel stack">
              <h3>{o.buyer_name.split(" ")[0]} has paid. The money is safe in escrow.</h3>
              <p className="muted small">
                Meet at a safe spot and hand the item over. You&apos;re paid as soon as {o.buyer_name.split(" ")[0]} confirms it, or automatically in {daysLeft} day{daysLeft === 1 ? "" : "s"}.
              </p>
              <form action={orderAction}>
                <input type="hidden" name="campus" value={campus} />
                <input type="hidden" name="order" value={o.id} />
                <button className="btn btn-ghost" name="action" value="cancel">Can&apos;t sell it after all? Cancel and refund</button>
              </form>
            </div>
          )}
          {role === "seller" && o.status === "disputed" && (
            <div className="panel stack">
              <h3>The buyer opened a dispute</h3>
              <p className="muted small">“{o.dispute_reason}”</p>
              <p className="small">A CampusLoop moderator will review the listing, photos and your chat, then decide. Reply in the chat to share your side.</p>
            </div>
          )}

          {(o.status === "released" || o.status === "refunded") && o.resolution_note && (
            <div className="panel stack"><h3>Moderator decision</h3><p className="small">{o.resolution_note}</p></div>
          )}

          <section className="stack">
            <span className="mono">Escrow audit trail</span>
            <ol className="timeline">
              {events.map((e) => (
                <li key={e.id}>
                  <b>{e.action}</b> <span className="faint small">· {e.actor} · {timeAgo(e.created_at)}</span>
                  {e.note && <p className="small muted">{e.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </main>
  );
}
