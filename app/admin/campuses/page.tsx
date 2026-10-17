import Link from "next/link";
import { listTenants } from "@/lib/tenant";
import { launchCampusAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Campuses({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const tenants = await listTenants();
  return (
    <main className="wrap page stack-lg" style={{ maxWidth: 760 }}>
      <form action={launchCampusAction} className="panel stack-lg" style={{ padding: 28 }}>
        <div className="stack" style={{ gap: 6 }}>
          <span className="mono">New-campus deploy · {tenants.length} live</span>
          <h1 style={{ fontSize: 30 }}>Launch a campus in 30 seconds</h1>
          <p className="muted">One row in the tenants table. No code, no redeploy. The subdomain, theme and .edu login work right away.</p>
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="form-grid">
          <div className="field"><label>Full name</label><input name="name" className="input" placeholder="Georgia Institute of Technology" required /></div>
          <div className="field"><label>Short name</label><input name="short_name" className="input" placeholder="Georgia Tech" required /></div>
          <div className="field"><label>Slug / subdomain</label><input name="id" className="input" placeholder="gatech" required /></div>
          <div className="field"><label>Email domains</label><input name="email_domains" className="input" placeholder="gatech.edu" required /><span className="hint">Comma separated</span></div>
          <div className="field"><label>Mascot</label><input name="mascot" className="input" placeholder="Yellow Jackets" /></div>
          <div className="field"><label>City</label><input name="city" className="input" placeholder="Atlanta, GA" /></div>
          <div className="field"><label>Primary color</label><input name="primary_color" type="color" className="swatch" defaultValue="#003057" /></div>
          <div className="field"><label>Accent color</label><input name="accent_color" type="color" className="swatch" defaultValue="#B3A369" /></div>
          <div className="field full"><label>Safe meetup spots</label><textarea name="meetup_spots" className="textarea" style={{ minHeight: 70 }} placeholder={"Student Center, main entrance\nLibrary lobby"} /><span className="hint">One per line</span></div>
        </div>
        <button className="btn btn-ink btn-lg" style={{ alignSelf: "flex-start" }}>Launch campus</button>
      </form>
      <section className="stack">
        <h2>Live campuses</h2>
        <div className="panel" style={{ padding: 0 }}>
          {tenants.map((t) => (
            <Link key={t.id} href={`/c/${t.id}`} className="thread-row">
              <span className="avatar" style={{ background: t.primary_color }}>{t.short_name[0]}</span>
              <span style={{ flex: 1 }}><b>{t.short_name}</b> <span className="faint small">· /c/{t.id} · @{t.email_domains.join(", @")}</span></span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
