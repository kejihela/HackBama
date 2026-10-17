import Link from "next/link";
import { listTenants } from "@/lib/tenant";
import { networkStats } from "@/lib/queries";
import { onColor } from "@/lib/format";
import { CampusLogo } from "@/components/CampusLogo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const tenants = await listTenants();
  const stats = await networkStats();
  return (
    <main className="wrap page stack-lg">
      <section className="landing-hero stack-lg">
        <span className="mono">HackBama · Multi-campus marketplace</span>
        <h1>
          Trade in circles.
          <br />
          Every campus.
        </h1>
        <p className="muted" style={{ fontSize: 18, maxWidth: 640 }}>
          CampusLoop is a verified-student marketplace for textbooks, dorm gear, lab supplies, tickets, tutoring and rides.
          It finds <b>trade loops</b>: A gives to B, B gives to C, C gives to A, so nobody needs cash.
        </p>
        <div className="stat-row">
          <div className="stat"><b>{stats.campuses}</b><span className="faint small">campuses</span></div>
          <div className="stat"><b>{stats.students}</b><span className="faint small">verified students</span></div>
          <div className="stat"><b>{stats.listings}</b><span className="faint small">active listings</span></div>
          <div className="stat"><b>{stats.loops}</b><span className="faint small">loops completed</span></div>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Pick your campus</h2>
          <Link href="/admin/campuses" className="btn btn-sm">+ Launch a campus</Link>
        </div>
        <div className="grid">
          {tenants.map((t) => (
            <Link key={t.id} href={`/c/${t.id}`} className="campus-card" style={{ background: t.primary_color, color: onColor(t.primary_color) }}>
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <span className="mono" style={{ color: "inherit", opacity: 0.8 }}>@{t.email_domains[0]}</span>
                {t.logo && <CampusLogo logo={t.logo} name={t.short_name} size={52} />}
              </div>
              <div>
                <h3>{t.short_name}</h3>
                <span className="small" style={{ opacity: 0.85 }}>{t.mascot} · {t.city}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
