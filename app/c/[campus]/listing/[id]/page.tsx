import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getViewer } from "@/lib/auth";
import { categoryLabel } from "@/lib/categories";
import { getListing } from "@/lib/queries";
import { courseDemand } from "@/lib/matching";
import { activeOrderForListing, AUTO_RELEASE_DAYS, feeFor } from "@/lib/escrow";
import { MODERATION_INFO, type ModerationCategory } from "@/lib/safety";
import { avatarColor, initials, money, timeAgo } from "@/lib/format";
import { ListingTile } from "@/components/ListingTile";
import { SafetyCaution } from "@/components/SafetyCaution";
import photoCredits from "@/lib/photo-credits.json";
import { trustOf } from "@/lib/trust";
import { TrustBadge } from "@/components/TrustBadge";
import { buyWithEscrowAction, contactSellerAction, setListingStatusAction } from "../../actions";

type Props = {
  params: Promise<{ campus: string; id: string }>;
  searchParams: Promise<{ created?: string; review?: string; blocked?: string; reason?: string; strikes?: string; suspended?: string; buyError?: string }>;
};

export default async function ListingPage({ params, searchParams }: Props) {
  const { campus, id } = await params;
  const sp = await searchParams;
  const viewer = await getViewer();
  const l = await getListing(Number(id), viewer?.tenant_id ?? null);
  if (!l) notFound();
  const isMine = viewer?.id === l.seller_id;
  // Listings waiting on (or failed) moderation are only visible to their seller.
  if ((l.status === "review" || l.status === "rejected") && !isMine) notFound();

  const sellerCampus = (await getTenant(l.tenant_id))!;
  const demand = l.course_code ? await courseDemand(l.course_code) : 0;
  const crossCampus = viewer && viewer.tenant_id !== l.tenant_id;
  const sellerTrust = (await trustOf(l.seller_id))!;
  const credit = l.image ? (photoCredits as Record<string, { creator: string; license: string; page: string }>)[l.image] : undefined;
  const order = l.status === "pending" ? await activeOrderForListing(l.id) : null;
  const myOrder = order && viewer && (order.buyer_id === viewer.id || order.seller_id === viewer.id) ? order : null;
  const buyable = l.status === "active" && l.mode !== "trade" && (l.price_cents ?? 0) > 0;
  const blocked = sp.blocked && sp.blocked in MODERATION_INFO ? (sp.blocked as ModerationCategory) : null;

  return (
    <main className="wrap page stack-lg">
      <Link href={`/c/${campus}`} className="faint small">
        ← Back to listings
      </Link>
      {sp.created && <div className="alert success">Your listing passed the check and is live. {l.mode !== "sell" && "It's in the trade-loop matcher too."}</div>}
      {l.status === "review" && (
        <div className="verify verify-warn">
          <span className="mono" style={{ color: "inherit" }}>Under moderator review · only you can see this</span>
          <b>{l.review_note}</b>
          <span className="small">It goes live as soon as a moderator approves it.</span>
        </div>
      )}
      {l.status === "rejected" && (
        <div className="verify verify-bad">
          <span className="mono" style={{ color: "inherit" }}>Not approved</span>
          <b>{l.review_note}</b>
        </div>
      )}

      <div className="detail">
        <div className="stack" style={{ gap: 6 }}>
          <ListingTile image={l.image} category={l.category} color={l.tenant_color} course={l.course_code} />
          {credit && (
            <a href={credit.page} target="_blank" rel="noreferrer" className="faint" style={{ fontSize: 11 }}>
              Demo photo: {credit.creator} · {credit.license}
            </a>
          )}
        </div>
        <div className="stack-lg">
          <div className="stack" style={{ gap: 10 }}>
            <div className="row">
              <span className="badge campus-tag" style={{ background: l.tenant_color }}>
                {l.tenant_short_name}
              </span>
              <span className="badge">{categoryLabel(l.category)}</span>
              {l.mode !== "sell" && <span className="badge trade">Open to trade</span>}
              {l.visibility === "network" && <span className="badge network">Cross-campus</span>}
              {l.status === "pending" && <span className="badge warn">Sale pending in escrow</span>}
              {(l.status === "sold" || l.status === "traded") && <span className="badge warn">{l.status === "traded" ? "Traded" : "Sold"}</span>}
            </div>
            <h1 style={{ fontSize: 32 }}>{l.title}</h1>
            <div className="price" style={{ fontSize: 28 }}>
              {l.mode === "trade" ? "Trade only" : money(l.price_cents)}
              {l.mode === "both" && <span className="faint small" style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}> · or trade</span>}
            </div>
            {l.price_check && l.price_check !== "free" && l.price_low != null && l.status !== "review" && (
              <div className="price-verified">
                <span className="tick">✓</span>
                <span className="small">
                  {l.price_check === "manual" ? (
                    <><b>Price approved by a moderator</b></>
                  ) : (
                    <>
                      <b>Fair price</b> · within {money(l.price_low)}–{money(l.price_high)}, the {l.price_basis}
                    </>
                  )}
                </span>
              </div>
            )}
          </div>

          {l.description && <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{l.description}</p>}

          <dl className="kv">
            <dt>Seller</dt>
            <dd className="row" style={{ gap: 8 }}>
              <span className="avatar" style={{ background: avatarColor(l.seller_id), width: 24, height: 24, fontSize: 10 }}>
                {initials(l.seller_name)}
              </span>
              <Link href={`/c/${campus}/u/${l.seller_id}`} style={{ textDecoration: "underline" }}>{l.seller_name}</Link>
              <TrustBadge trust={sellerTrust} href={`/c/${campus}/u/${l.seller_id}`} />
              <span className="faint" style={{ fontWeight: 500 }}>· verified {sellerCampus.short_name} student</span>
            </dd>
            <dt>Posted</dt>
            <dd>{timeAgo(l.created_at)}</dd>
            {l.course_code && (
              <>
                <dt>Course</dt>
                <dd>
                  {l.course_code}
                  {demand > 0 && <span className="faint" style={{ fontWeight: 500 }}> · {demand} student{demand > 1 ? "s" : ""} looking for this course</span>}
                </dd>
              </>
            )}
          </dl>

          {myOrder && (
            <Link href={`/c/${campus}/orders/${myOrder.id}`} className="escrow-box row between">
              <span>
                <b>{myOrder.buyer_id === viewer!.id ? "You paid into escrow" : "Buyer paid into escrow"}</b>
                <span className="small muted" style={{ display: "block" }}>
                  {money(myOrder.amount_cents)} held by CampusLoop · {myOrder.status === "disputed" ? "in dispute" : "waiting for inspection"}
                </span>
              </span>
              <span className="btn btn-sm btn-ink">View order</span>
            </Link>
          )}

          {sp.buyError && <div className="alert error">{sp.buyError}</div>}
          {buyable && !isMine && (
            <form action={buyWithEscrowAction} className="escrow-box stack">
              <input type="hidden" name="campus" value={campus} />
              <input type="hidden" name="listing" value={l.id} />
              <div className="row between">
                <span className="mono" style={{ color: "var(--ok)" }}>CampusLoop Protect · escrow</span>
                <span className="badge trade">Buyer protection</span>
              </div>
              {sellerTrust.level === "caution" && (
                <div className="verify verify-bad small">
                  <b>This seller has a low trust score ({sellerTrust.score}).</b> Escrow still protects you: inspect the item carefully before releasing payment.
                </div>
              )}
              <ol className="steps">
                <li><b>Pay now.</b> CampusLoop holds the money. The seller can see it&apos;s there but can&apos;t touch it.</li>
                <li><b>Meet and inspect</b> at a safe campus spot. Make sure it matches the photos and works.</li>
                <li><b>Release the payment</b> if it&apos;s as described, or open a dispute and a moderator decides.</li>
              </ol>
              <dl className="kv small">
                <dt>Item</dt>
                <dd>{money(l.price_cents)}</dd>
                <dt>Buyer protection (3%)</dt>
                <dd>{money(feeFor(l.price_cents!))}</dd>
                <dt>You pay</dt>
                <dd>{money(l.price_cents! + feeFor(l.price_cents!))}</dd>
              </dl>
              <label className="row small" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
                <input type="checkbox" name="agree" value="1" required style={{ marginTop: 3 }} />
                <span>
                  I understand the payment is released to the seller when I confirm the item, or automatically after {AUTO_RELEASE_DAYS} days if I don&apos;t respond.
                </span>
              </label>
              <button className="btn btn-ok btn-lg">{viewer ? `Pay ${money(l.price_cents! + feeFor(l.price_cents!))} into escrow` : "Sign in to buy"}</button>
              <span className="faint" style={{ fontSize: 11 }}>Demo mode: payments are simulated. Production uses Stripe Connect with held funds.</span>
            </form>
          )}

          {isMine ? (
            <div className="panel stack">
              <h3>This is your listing</h3>
              <form action={setListingStatusAction} className="row">
                <input type="hidden" name="campus" value={campus} />
                <input type="hidden" name="id" value={l.id} />
                {l.status === "active" ? (
                  <button className="btn" name="status" value="sold">Mark as sold</button>
                ) : l.status === "sold" ? (
                  <button className="btn" name="status" value="active">Relist</button>
                ) : null}
                <Link href={`/c/${campus}/messages`} className="btn btn-ghost">See messages</Link>
              </form>
            </div>
          ) : l.status === "active" || l.status === "pending" ? (
            <form action={contactSellerAction} className="panel stack">
              <input type="hidden" name="campus" value={campus} />
              <input type="hidden" name="listing" value={l.id} />
              <h3>Message {l.seller_name.split(" ")[0]}</h3>
              {blocked && <SafetyCaution category={blocked} reason={sp.reason?.slice(0, 160)} strikes={Number(sp.strikes) || undefined} limit={5} suspended={sp.suspended === "1"} />}
              {crossCampus && (
                <p className="small muted">
                  {l.seller_name.split(" ")[0]} is at {sellerCampus.short_name}. Cross-campus deals work best for tickets, rides and
                  game-weekend meetups.
                </p>
              )}
              <textarea
                name="body"
                className="textarea"
                style={{ minHeight: 80 }}
                defaultValue={blocked ? "" : l.mode === "trade" ? `Hi! I'm interested in trading for your ${l.title}. ` : `Hi! Is your ${l.title} still available?`}
              />
              <button className="btn btn-primary">{viewer ? "Send message" : "Sign in to message"}</button>
              {l.mode !== "sell" && (
                <p className="faint small">
                  No cash? <Link href={`/c/${campus}/loops`} style={{ textDecoration: "underline" }}>Add it to your wants</Link> and we&apos;ll find a trade loop.
                </p>
              )}
            </form>
          ) : null}

          <div className="stack" style={{ gap: 8 }}>
            <span className="mono">Safe meetup spots · {sellerCampus.short_name}</span>
            {sellerCampus.meetup_spots.map((s) => (
              <div key={s} className="spot">{s}</div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
