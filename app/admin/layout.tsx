import Link from "next/link";
import { Suspense } from "react";
import { QueryError } from "@/components/QueryError";
import { isAdmin } from "@/lib/admin";
import { escrowTotals } from "@/lib/escrow";
import { listingsAwaitingReview } from "@/lib/moderation";
import { NavLinks } from "@/components/NavLinks";
import { adminLoginAction, adminLogoutAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await isAdmin();
  const theme = { "--brand": "#151413", "--on-brand": "#ffffff", "--accent": "#1f7a4d" } as React.CSSProperties;

  if (!admin) {
    return (
      <div style={theme}>
        <main className="wrap page" style={{ maxWidth: 440 }}>
          <Link href="/" className="faint small">← CampusLoop</Link>
          <form action={adminLoginAction} className="panel stack-lg" style={{ padding: 28, marginTop: 12 }}>
            <div className="stack" style={{ gap: 6 }}>
              <span className="mono">Staff only</span>
              <h1 style={{ fontSize: 28 }}>Trust &amp; safety console</h1>
              <p className="muted small">Escrow disputes, listing review, the safety log, and launching new campuses.</p>
            </div>
            <Suspense>
              <QueryError />
            </Suspense>
            <div className="field">
              <label htmlFor="key">Admin key</label>
              <input id="key" name="key" type="password" className="input" placeholder="hackbama (demo)" required autoFocus />
            </div>
            <button className="btn btn-ink btn-lg">Sign in</button>
          </form>
        </main>
      </div>
    );
  }

  const totals = await escrowTotals();
  const reviews = (await listingsAwaitingReview()).length;
  return (
    <div style={theme}>
      <header className="topbar">
        <div className="wrap">
          <Link href="/admin/escrow" className="brandmark">
            <span className="dot" />
            <span>
              Moderator <small>· CampusLoop</small>
            </span>
          </Link>
          <NavLinks
            links={[
              { href: "/admin/escrow", label: "Escrow", count: totals.disputes },
              { href: "/admin/review", label: "Listing review", count: reviews },
              { href: "/admin/safety", label: "Safety log" },
              { href: "/admin/campuses", label: "Campuses" },
            ]}
          />
          <form action={adminLogoutAction}>
            <button className="btn btn-sm btn-ghost" style={{ color: "inherit" }}>Sign out</button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
