import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { ordersFor, walletFor, type Order } from "@/lib/escrow";
import { money, timeAgo, ORDER_STATUS_LABEL as STATUS_LABEL } from "@/lib/format";
import { ListingTile } from "@/components/ListingTile";

export default async function Orders({ params }: { params: Promise<{ campus: string }> }) {
  const { campus } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/c/${campus}/login?next=/c/${campus}/orders`);
  const { purchases, sales } = await ordersFor(viewer.id);
  const w = await walletFor(viewer.id);

  const Row = ({ o, role }: { o: Order; role: "buyer" | "seller" }) => (
    <Link href={`/c/${campus}/orders/${o.id}`} className="thread-row">
      <div style={{ width: 64, flex: "none", borderRadius: 8, overflow: "hidden" }}>
        <ListingTile image={o.listing_image} category={o.listing_category} color={o.tenant_color} />
      </div>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: "block" }}>{o.listing_title}</b>
        <span className="faint small">
          {role === "buyer" ? `from ${o.seller_name}` : `to ${o.buyer_name}`} · {timeAgo(o.created_at)}
        </span>
      </span>
      <span className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
        <b>{money(o.amount_cents)}</b>
        <span className={`badge status-${o.status}`}>{STATUS_LABEL[o.status]}</span>
      </span>
    </Link>
  );

  return (
    <main className="wrap page stack-lg" style={{ maxWidth: 860 }}>
      <div className="stack" style={{ gap: 6 }}>
        <span className="mono">CampusLoop Protect</span>
        <h1>Orders &amp; wallet</h1>
      </div>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="stat"><b>{money(w.outgoingHeld)}</b><span className="faint small">you&apos;ve paid, held in escrow</span></div>
        <div className="stat"><b>{money(w.incomingHeld)}</b><span className="faint small">coming to you after inspection</span></div>
        <div className="stat"><b>{money(w.earned)}</b><span className="faint small">released to you</span></div>
      </div>

      <section className="stack">
        <h2>Purchases</h2>
        {purchases.length ? <div className="panel" style={{ padding: 0 }}>{purchases.map((o) => <Row key={o.id} o={o} role="buyer" />)}</div> : <div className="empty">No purchases yet. Look for “Pay into escrow” on any listing.</div>}
      </section>
      <section className="stack">
        <h2>Sales</h2>
        {sales.length ? <div className="panel" style={{ padding: 0 }}>{sales.map((o) => <Row key={o.id} o={o} role="seller" />)}</div> : <div className="empty">No sales yet.</div>}
      </section>
    </main>
  );
}
