import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant";
import { avatarColor, initials, onColor } from "@/lib/format";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { NavLinks } from "@/components/NavLinks";
import { signOutAction } from "./actions";

type Props = { children: React.ReactNode; params: Promise<{ campus: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTenant((await params).campus);
  return { title: t ? `CampusLoop · ${t.short_name}` : "CampusLoop" };
}

export default async function CampusLayout({ children, params }: Props) {
  const { campus } = await params;
  const tenant = await getTenant(campus);
  if (!tenant) notFound();
  const viewer = await getViewer();

  const pendingLoops = viewer
    ? (
        (await db()
          .prepare(
            `SELECT COUNT(*) AS n FROM trade_legs tl JOIN trade_cycles c ON c.id = tl.cycle_id
              WHERE tl.giver_id = ? AND tl.accepted = 0 AND c.status = 'proposed'`,
          )
          .get(viewer.id)) as { n: number }
      ).n
    : 0;

  const openOrders = viewer
    ? (
        (await db()
          .prepare("SELECT COUNT(*) AS n FROM orders WHERE (buyer_id = ? OR seller_id = ?) AND status IN ('held','disputed')")
          .get(viewer.id, viewer.id)) as { n: number }
      ).n
    : 0;

  const onBrand = onColor(tenant.primary_color);
  const theme = {
    "--brand": tenant.primary_color,
    "--on-brand": onBrand,
    "--accent": tenant.accent_color === tenant.primary_color ? "#ffffff" : tenant.accent_color,
  } as React.CSSProperties;

  const base = `/c/${campus}`;
  const visiting = viewer && viewer.tenant_id !== campus;

  return (
    <div style={theme}>
      <header className="topbar" data-light={onBrand === "#111111" ? "" : undefined}>
        <div className="wrap">
          <Link href={base} className="brandmark">
            <span className="dot" />
            <span>
              {tenant.short_name} <small>· CampusLoop</small>
            </span>
          </Link>
          <NavLinks
            links={[
              { href: base, label: "Browse", exact: true },
              { href: `${base}/loops`, label: "Trade loops", count: pendingLoops },
              { href: `${base}/gameday`, label: "Game day" },
              { href: `${base}/messages`, label: "Messages" },
              { href: `${base}/orders`, label: "Orders", count: openOrders },
            ]}
          />
          <div className="top-actions">
            {visiting && (
              <span className="visitor hide-sm" title="You're browsing another campus. You see what they share with the network.">
                Visiting from {viewer.tenant_short_name}
              </span>
            )}
            {viewer ? (
              <>
                <span className="user-chip" title={`Signed in as ${viewer.email}`}>
                  <span className="avatar" style={{ background: avatarColor(viewer.id), width: 28, height: 28, fontSize: 11 }}>
                    {initials(viewer.name)}
                  </span>
                  <span className="user-name hide-sm">
                    {viewer.name}
                    <small>{viewer.tenant_short_name}</small>
                  </span>
                </span>
                <Link href={`${base}/sell`} className="btn btn-sm btn-on-brand">
                  + List
                </Link>
                <form action={signOutAction}>
                  <input type="hidden" name="campus" value={campus} />
                  <button className="btn btn-sm btn-ghost hide-sm" style={{ color: "inherit" }} title={viewer.email}>
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link href={`${base}/login`} className="btn btn-sm btn-on-brand">
                Sign in with .edu
              </Link>
            )}
          </div>
        </div>
      </header>
      {children}
      <footer className="footer">
        <div className="wrap row between">
          <span>
            {tenant.name} · {tenant.city}
          </span>
          <span className="row">
            <Link href="/">All campuses</Link>·<Link href="/admin">Moderator console</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
