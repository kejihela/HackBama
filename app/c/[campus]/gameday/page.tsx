import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { getViewer } from "@/lib/auth";
import { browseListings, gameDayListings, upcomingEvents } from "@/lib/queries";
import { daysUntil, eventDate } from "@/lib/format";
import { ListingCard } from "@/components/ListingCard";

export default async function GameDay({ params }: { params: Promise<{ campus: string }> }) {
  const { campus } = await params;
  const tenant = (await getTenant(campus))!;
  const viewer = await getViewer();
  const events = await upcomingEvents(campus);

  // Load each game's listings up front (JSX callbacks can't await).
  const sections = await Promise.all(
    events.map(async (e) => {
      const away = e.away_tenant === campus;
      const other = away ? e.home_tenant : e.away_tenant;
      const host = (await getTenant(e.home_tenant))!;
      const listings = away
        ? await gameDayListings(e.home_tenant, viewer?.tenant_id ?? null)
        : (await browseListings({ site: campus, scope: "campus", viewerTenant: viewer?.tenant_id ?? null, categories: ["tickets", "rides", "housing"] })).filter(
            (l) => l.visibility === "network",
          );
      const rides = away
        ? (await browseListings({ site: other, scope: "network", viewerTenant: viewer?.tenant_id ?? null, categories: ["rides"] })).filter(
            (l) => l.tenant_id === campus || l.tenant_id === other,
          )
        : [];
      const extraRides = rides.filter((r) => !listings.some((l) => l.id === r.id));
      return { e, away, host, listings, extraRides };
    }),
  );

  return (
    <main className="wrap page stack-lg">
      <div className="stack" style={{ gap: 6 }}>
        <span className="mono">Game day · cross-campus</span>
        <h1>Away game? The host campus has you covered.</h1>
        <p className="muted" style={{ maxWidth: 680 }}>
          When {tenant.short_name} travels, the host school&apos;s students open up spare tickets, rides and couches to visiting
          fans. Home game? Host a visitor and make some cash.
        </p>
      </div>

      {events.length === 0 && <div className="empty">No upcoming games on the schedule.</div>}

      {sections.map(({ e, away, host, listings, extraRides }) => {
        return (
          <section key={e.id} className="stack-lg">
            <div className="banner" style={{ background: e.home_color }}>
              <div className="stack" style={{ gap: 4 }}>
                <span className="mono">
                  {eventDate(e.starts_at)} · {daysUntil(e.starts_at)} days · {away ? `away at ${host.short_name}` : "home game"}
                </span>
                <h2 style={{ color: "#fff", fontSize: 28 }}>{e.title}</h2>
                <p style={{ opacity: 0.9 }}>{host.city}</p>
              </div>
              {!away && (
                <Link href={`/c/${campus}/sell?category=housing&visibility=network`} className="btn btn-on-brand" style={{ ["--brand" as string]: e.home_color, ["--on-brand" as string]: "#fff" }}>
                  Host a {e.away_name} fan →
                </Link>
              )}
            </div>
            <div>
              <div className="section-head">
                <h2>{away ? `From ${host.short_name} students` : `What ${tenant.short_name} is offering visitors`}</h2>
                <span className="faint small">Tickets · rides · game-day stays</span>
              </div>
              {listings.length + extraRides.length ? (
                <div className="grid">
                  {[...listings, ...extraRides].map((l) => (
                    <ListingCard key={l.id} l={l} site={campus} showCampus />
                  ))}
                </div>
              ) : (
                <div className="empty">Nothing shared yet for this game.</div>
              )}
            </div>
          </section>
        );
      })}
    </main>
  );
}
