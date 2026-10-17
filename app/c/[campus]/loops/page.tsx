import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { buildEdges, cyclesForUser } from "@/lib/matching";
import { getListing, listingsBySeller, wantsFor } from "@/lib/queries";
import { avatarColor, initials, timeAgo } from "@/lib/format";
import { LoopDiagram } from "@/components/LoopDiagram";
import { ListingCard } from "@/components/ListingCard";
import { acceptLoopAction, addWantAction, declineLoopAction, removeWantAction } from "../actions";

type Props = {
  params: Promise<{ campus: string }>;
  searchParams: Promise<{ found?: string; locked?: string; error?: string; added?: string }>;
};

export default async function Loops({ params, searchParams }: Props) {
  const { campus } = await params;
  const sp = await searchParams;
  const viewer = await getViewer();
  const tenant = (await getTenant(campus))!;

  if (!viewer) {
    return (
      <main className="wrap page" style={{ maxWidth: 760 }}>
        <div className="panel stack-lg" style={{ padding: 32 }}>
          <span className="mono">Trade loops</span>
          <h1>Trade in a circle.</h1>
          <HowItWorks />
          <Link href={`/c/${campus}/login?next=/c/${campus}/loops`} className="btn btn-primary btn-lg" style={{ alignSelf: "flex-start" }}>
            Sign in with your @{tenant.email_domains[0]} email
          </Link>
        </div>
      </main>
    );
  }

  const found = new Set((sp.found ?? "").split(",").filter(Boolean).map(Number));
  const cycles = (await cyclesForUser(viewer.id)).filter((c) => c.status === "proposed" || c.status === "completed");
  const wants = await wantsFor(viewer.id);
  const tradeables = (await listingsBySeller(viewer.id)).filter((l) => l.status === "active" && l.mode !== "sell");

  const edges = await buildEdges();
  const wantMine = new Set(edges.filter((e) => e.from === viewer.id).map((e) => e.to)).size;
  const forMe = (
    await Promise.all(
      [...new Set(edges.filter((e) => e.to === viewer.id).map((e) => e.listingId))].slice(0, 8).map((id) => getListing(id, viewer.tenant_id)),
    )
  ).filter((l) => l !== null);

  return (
    <main className="wrap page stack-lg">
      <div className="stack" style={{ gap: 6 }}>
        <span className="mono">Trade loops · no cash required</span>
        <h1>Your trade loops</h1>
        <p className="muted" style={{ maxWidth: 680 }}>
          List what you have, say what you want. When your item can reach someone who has what you need, even through two or
          three other students at any campus, we line up the whole circle.
        </p>
      </div>

      {sp.error && <div className="alert error">{sp.error}</div>}
      {found.size > 0 && (
        <div className="alert success" style={{ fontSize: 16 }}>
          <b>Loop found!</b> We matched you into a trade circle. Everyone accepts, then you meet up and swap.
        </div>
      )}
      {sp.added && !found.size && (
        <div className="alert info">
          Saved. No loop yet. We re-check every time anyone on CampusLoop lists or wants something, so you&apos;ll see it here
          when one forms.
        </div>
      )}
      {sp.locked && (
        <div className="alert success" style={{ fontSize: 16 }}>
          <b>Locked in.</b> Everyone accepted. Use the loop chat to pick a time and meetup spot.
        </div>
      )}

      <div className="loops-layout">
        <aside className="stack-lg">
          <section className="panel stack">
            <h3>What you want</h3>
            <form action={addWantAction} className="stack">
              <input type="hidden" name="campus" value={campus} />
              <div className="field">
                <label htmlFor="w-keywords">Looking for</label>
                <input id="w-keywords" name="keywords" className="input" placeholder="mini fridge, desk chair…" />
              </div>
              <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="w-cat">Category</label>
                  <select id="w-cat" name="category" className="select" defaultValue="any">
                    <option value="any">Any</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ width: 110 }}>
                  <label htmlFor="w-course">Course</label>
                  <input id="w-course" name="course_code" className="input" placeholder="CH 101" />
                </div>
              </div>
              <button className="btn btn-primary">Add &amp; find loops</button>
            </form>
            {wants.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                {wants.map((w) => (
                  <div key={w.id} className="want-item">
                    <span>
                      <b>{[w.keywords, w.course_code].filter(Boolean).join(" · ") || categoryLabel(w.category)}</b>
                      <span className="faint small"> · {w.category === "any" ? "any category" : categoryLabel(w.category)}</span>
                    </span>
                    <form action={removeWantAction}>
                      <input type="hidden" name="campus" value={campus} />
                      <input type="hidden" name="id" value={w.id} />
                      <button className="btn btn-sm btn-ghost" aria-label="Remove">✕</button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel stack">
            <div className="row between">
              <h3>What you can trade</h3>
              <Link href={`/c/${campus}/sell`} className="btn btn-sm">+ Add</Link>
            </div>
            {tradeables.length ? (
              tradeables.map((l) => (
                <Link key={l.id} href={`/c/${campus}/listing/${l.id}`} className="want-item">
                  <b style={{ fontWeight: 600 }}>{l.title}</b>
                  <span className="faint small">{timeAgo(l.created_at)}</span>
                </Link>
              ))
            ) : (
              <p className="faint small">Nothing open to trade. List something as &ldquo;Trade only&rdquo; or &ldquo;Cash or trade&rdquo; to join loops.</p>
            )}
            {wantMine > 0 && (
              <p className="small" style={{ color: "var(--ok)", fontWeight: 650 }}>
                {wantMine} student{wantMine > 1 ? "s" : ""} want{wantMine === 1 ? "s" : ""} something you have.
              </p>
            )}
          </section>
        </aside>

        <section className="stack-lg">
          {cycles.length === 0 ? (
            <div className="empty stack" style={{ alignItems: "center" }}>
              <h3>No loops yet</h3>
              <HowItWorks compact />
            </div>
          ) : (
            cycles.map((c) => {
              const myLeg = c.legs.find((l) => l.giver_id === viewer.id)!;
              const getting = c.legs.find((l) => l.receiver_id === viewer.id)!;
              const waitingOn = c.legs.filter((l) => !l.accepted).map((l) => (l.giver_id === viewer.id ? "you" : l.giver_name.split(" ")[0]));
              return (
                <article key={c.id} className={`loop-card ${found.has(c.id) ? "fresh" : ""}`}>
                  <LoopDiagram legs={c.legs} meId={viewer.id} />
                  <div className="stack">
                    <div className="row between">
                      <span className="mono">
                        Loop #{c.id} · {c.legs.length}-way · {new Set(c.legs.map((l) => l.giver_tenant)).size > 1 ? "cross-campus" : tenant.short_name}
                      </span>
                      {c.status === "completed" ? <span className="badge trade">Locked in</span> : <span className="badge">Proposed {timeAgo(c.created_at)}</span>}
                    </div>
                    <h2>
                      You give <u>{myLeg.listing_title}</u>, you get <u>{getting.listing_title}</u>.
                    </h2>
                    <div className="legs">
                      {c.legs.map((l) => (
                        <div key={l.position} className={`leg ${l.giver_id === viewer.id ? "me" : ""}`}>
                          <span className="avatar" style={{ background: avatarColor(l.giver_id) }}>
                            {initials(l.giver_name)}
                          </span>
                          <span className="small">
                            <b>{l.giver_id === viewer.id ? "You" : l.giver_name}</b>
                            <span className="faint"> ({l.giver_tenant_name})</span> give{l.giver_id === viewer.id ? "" : "s"}{" "}
                            <Link href={`/c/${campus}/listing/${l.listing_id}`} style={{ textDecoration: "underline" }}>
                              {l.listing_title}
                            </Link>{" "}
                            → <b>{l.receiver_id === viewer.id ? "you" : l.receiver_name.split(" ")[0]}</b>
                          </span>
                          <span className={`check ${l.accepted ? "yes" : "no"}`} title={l.accepted ? "Accepted" : "Waiting"}>
                            {l.accepted ? "✓" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                    {c.status === "proposed" ? (
                      myLeg.accepted ? (
                        <div className="row between">
                          <span className="faint small">You accepted. Waiting on {waitingOn.join(", ")}.</span>
                          {c.thread_id && <Link href={`/c/${campus}/messages/${c.thread_id}`} className="btn btn-sm">Loop chat</Link>}
                        </div>
                      ) : (
                        <div className="row">
                          <form action={acceptLoopAction}>
                            <input type="hidden" name="campus" value={campus} />
                            <input type="hidden" name="id" value={c.id} />
                            <button className="btn btn-ok">Accept trade</button>
                          </form>
                          <form action={declineLoopAction}>
                            <input type="hidden" name="campus" value={campus} />
                            <input type="hidden" name="id" value={c.id} />
                            <button className="btn btn-ghost">Decline</button>
                          </form>
                          {c.thread_id && <Link href={`/c/${campus}/messages/${c.thread_id}`} className="btn btn-ghost">Loop chat</Link>}
                        </div>
                      )
                    ) : (
                      <div className="row between">
                        <span className="small muted">
                          Hand <b>{myLeg.listing_title}</b> to {myLeg.receiver_name.split(" ")[0]}. Pick a safe spot in the loop chat.
                        </span>
                        {c.thread_id && <Link href={`/c/${campus}/messages/${c.thread_id}`} className="btn btn-primary btn-sm">Open loop chat</Link>}
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          )}

          {forMe.length > 0 && (
            <section>
              <div className="section-head">
                <h2>Matches your wants</h2>
                <span className="faint small">Open to trade. They join a loop once the circle can close.</span>
              </div>
              <div className="grid">
                {forMe.map((l) => (
                  <ListingCard key={l.id} l={l} site={campus} />
                ))}
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

function HowItWorks({ compact }: { compact?: boolean }) {
  const steps = [
    ["List what you have", "Mark it “Trade only” or “Cash or trade”."],
    ["Say what you want", "Keywords, a category, or a course code."],
    ["We close the circle", "A gives to B, B gives to C, C gives to A, across campuses too."],
  ];
  return (
    <div className="how" style={compact ? { textAlign: "left", maxWidth: 700 } : undefined}>
      {steps.map(([t, d], i) => (
        <div key={t} className="stack" style={{ gap: 4 }}>
          <span className="num">0{i + 1}</span>
          <h3>{t}</h3>
          <p className="muted small">{d}</p>
        </div>
      ))}
    </div>
  );
}
