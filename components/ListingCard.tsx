import Link from "next/link";
import type { Listing } from "@/lib/queries";
import { money, timeAgo } from "@/lib/format";
import { ListingTile } from "./ListingTile";
import type { TrustResult } from "@/lib/trust-score";

export function ListingCard({ l, site, showCampus, trust }: { l: Listing; site: string; showCampus?: boolean; trust?: TrustResult }) {
  const foreign = l.tenant_id !== site;
  return (
    <Link href={`/c/${site}/listing/${l.id}`} className="card">
      <ListingTile
        image={l.image}
        category={l.category}
        color={l.tenant_color}
        course={l.course_code}
        corner={
          (showCampus || foreign) && (
            <span className="badge campus-tag" style={{ background: "rgba(0,0,0,0.55)" }}>
              {l.tenant_short_name}
            </span>
          )
        }
      />
      <div className="card-body">
        <div className="price">{l.mode === "trade" ? "Trade only" : money(l.price_cents)}</div>
        <div className="card-title">{l.title}</div>
        <div className="card-meta">
          {trust?.level === "trusted" && <span className="trust trust-trusted">✓ Trusted seller</span>}
          {(l.price_check === "fair" || l.price_check === "manual") && <span className="badge fair">✓ Fair price</span>}
          {l.mode !== "sell" && <span className="badge trade">Open to trade</span>}
          {l.visibility === "network" && !foreign && <span className="badge network">Cross-campus</span>}
          <span className="badge">{timeAgo(l.created_at)}</span>
        </div>
      </div>
    </Link>
  );
}
