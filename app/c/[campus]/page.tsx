import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { getViewer } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import { browseListings, listingsForMyCourses, upcomingEvents, wantsFor } from "@/lib/queries";
import { daysUntil, eventDate } from "@/lib/format";
import { ListingCard } from "@/components/ListingCard";
import { trustFor } from "@/lib/trust";

type Props = {
  params: Promise<{ campus: string }>;
  searchParams: Promise<{ scope?: string; q?: string; category?: string }>;
};

export default async function Browse({ params, searchParams }: Props) {
  const { campus } = await params;
  const sp = await searchParams;
  const tenant = (await getTenant(campus))!;
  const viewer = await getViewer();
  const scope = sp.scope === "network" ? "network" : "campus";
  const q = sp.q?.trim() ?? "";
  const category = CATEGORIES.some((c) => c.key === sp.category) ? sp.category : undefined;

  const listings = await browseListings({ site: campus, scope, viewerTenant: viewer?.tenant_id ?? null, q, category });
  const mine = viewer && viewer.tenant_id === campus;
  const courseMatches = mine && !q && !category ? await listingsForMyCourses(viewer.id, viewer.tenant_id) : [];
  const hasWants = viewer ? (await wantsFor(viewer.id)).length > 0 : false;
  const event = (await upcomingEvents(campus)).find((e) => daysUntil(e.starts_at) <= 60);

  const trust = await trustFor([...listings, ...courseMatches].map((l) => l.seller_id));

  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { scope, q: q || undefined, category, ...o };
    Object.entries(merged).forEach(([k, v]) => v && !(k === "scope" && v === "campus") && p.set(k, v));
    const s = p.toString();
    return `/c/${campus}${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="stack" style={{ gap: 8 }}>
            <span className="mono">
              {scope === "campus" ? `${tenant.short_name} · verified @${tenant.email_domains[0]} students` : "Cross-campus network · every school on CampusLoop"}
            </span>
            <h1>{scope === "campus" ? `What do you need, ${tenant.mascot || tenant.short_name}?` : "Browse every campus."}</h1>
          </div>
          <form className="search" action={`/c/${campus}`}>
            {scope === "network" && <input type="hidden" name="scope" value="network" />}
            {category && <input type="hidden" name="category" value={category} />}
            <input className="input" name="q" defaultValue={q} placeholder="Search textbooks, fridges, tickets… or a course code like CH 101" />
            <button className="btn btn-ink">Search</button>
          </form>
          <div className="row between">
            <div className="segmented">
              <Link href={href({ scope: "campus" })} className={scope === "campus" ? "on" : ""}>
                {tenant.short_name}
              </Link>
              <Link href={href({ scope: "network" })} className={scope === "network" ? "on" : ""}>
                All campuses
              </Link>
            </div>
          </div>
          <div className="chips">
            <Link href={href({ category: undefined })} className={`chip ${!category ? "on" : ""}`}>
              Everything
            </Link>
            {CATEGORIES.filter((c) => tenant.categories.includes(c.key)).map((c) => (
              <Link key={c.key} href={href({ category: c.key })} className={`chip ${category === c.key ? "on" : ""}`}>
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <main className="wrap page stack-lg">
        {!viewer && scope === "campus" && (
          <div className="alert info">
            You&apos;re seeing what {tenant.short_name} students share with every campus.{" "}
            <Link href={`/c/${campus}/login`} style={{ textDecoration: "underline" }}>
              Sign in with your @{tenant.email_domains[0]} email
            </Link>{" "}
            to see everything posted on campus.
          </div>
        )}

        {event && (
          <div className="banner" style={{ background: event.home_color }}>
            <div className="stack" style={{ gap: 4 }}>
              <span className="mono">
                Game day · {eventDate(event.starts_at)} · {daysUntil(event.starts_at)} days out
              </span>
              <h2 style={{ color: "#fff" }}>{event.title}</h2>
              <p style={{ opacity: 0.9 }}>
                {event.away_tenant === campus
                  ? `Headed to ${event.home_name}? Tickets, rides and couches from ${event.home_name} students.`
                  : `${event.away_name} fans are coming to town. List a spare ticket, a ride or a couch for visitors.`}
              </p>
            </div>
            <Link
              href={event.away_tenant === campus ? `/c/${campus}/gameday` : `/c/${campus}/sell?category=housing&visibility=network`}
              className="btn btn-on-brand"
              style={{ ["--brand" as string]: event.home_color, ["--on-brand" as string]: "#fff" }}
            >
              {event.away_tenant === campus ? "Plan your trip →" : "Host a visitor →"}
            </Link>
          </div>
        )}

        {viewer && !hasWants && !q && (
          <Link href={`/c/${campus}/loops`} className="panel row between" style={{ borderStyle: "dashed" }}>
            <div className="stack" style={{ gap: 4 }}>
              <span className="mono">New · Trade loops</span>
              <h3>Short on cash? Trade in a circle.</h3>
              <p className="muted small">
                Tell us what you want. When your item can reach someone who has what you need, even through two or three
                other students, we line up the swap.
              </p>
            </div>
            <span className="btn btn-primary">Add what you want</span>
          </Link>
        )}

        {courseMatches.length > 0 && (
          <section>
            <div className="section-head">
              <h2>For your courses</h2>
              <span className="faint small">Books and supplies from students who just finished your classes</span>
            </div>
            <div className="grid">
              {courseMatches.map((l) => (
                <ListingCard key={l.id} l={l} site={campus} trust={trust.get(l.seller_id)} />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="section-head">
            <h2>
              {q ? `Results for “${q}”` : category ? CATEGORIES.find((c) => c.key === category)!.label : scope === "network" ? "Fresh across the network" : `Fresh at ${tenant.short_name}`}
            </h2>
            <span className="faint small">{listings.length} listings</span>
          </div>
          {listings.length ? (
            <div className="grid">
              {listings.map((l) => (
                <ListingCard key={l.id} l={l} site={campus} trust={trust.get(l.seller_id)} showCampus={scope === "network"} />
              ))}
            </div>
          ) : (
            <div className="empty stack" style={{ alignItems: "center" }}>
              <h3>Nothing here yet</h3>
              <p>Be the first to list something{category ? " in this category" : ""}.</p>
              <Link href={`/c/${campus}/sell${category ? `?category=${category}` : ""}`} className="btn btn-primary">
                List an item
              </Link>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
