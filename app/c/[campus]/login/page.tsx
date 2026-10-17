import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { DEMO_MODE, getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { avatarColor, initials } from "@/lib/format";
import { demoSignInAction, requestCodeAction, verifyCodeAction } from "../actions";

type Props = {
  params: Promise<{ campus: string }>;
  searchParams: Promise<{ step?: string; email?: string; error?: string; demo?: string; next?: string }>;
};

export default async function Login({ params, searchParams }: Props) {
  const { campus } = await params;
  const sp = await searchParams;
  const tenant = (await getTenant(campus))!;
  const viewer = await getViewer();
  if (viewer && sp.step !== "verify") redirect(sp.next?.startsWith("/c/") ? sp.next : `/c/${viewer.tenant_id}`);
  const verify = sp.step === "verify" && sp.email;
  const next = sp.next ?? "";

  const demoUsers = DEMO_MODE
    ? ((await db()
        .prepare("SELECT id, name, email FROM users WHERE tenant_id = ? ORDER BY id LIMIT 6")
        .all(campus)) as { id: number; name: string; email: string }[])
    : [];

  return (
    <main className="wrap page" style={{ maxWidth: 480 }}>
      <div className="panel stack-lg" style={{ padding: 28 }}>
        <div className="stack" style={{ gap: 6 }}>
          <span className="mono">Campus-verified</span>
          <h1 style={{ fontSize: 30 }}>{verify ? "Check your inbox" : `Sign in to ${tenant.short_name}`}</h1>
          <p className="muted">
            {verify
              ? `We sent a 6-digit code to ${sp.email}.`
              : `CampusLoop is for verified students only. Use your @${tenant.email_domains[0]} email. No passwords.`}
          </p>
        </div>

        {sp.error && <div className="alert error">{sp.error}</div>}
        {verify && sp.demo && (
          <div className="alert info">
            <b>Demo mode:</b> no email provider is configured, so here&apos;s your code: <b className="mono" style={{ fontSize: 15, color: "inherit" }}>{sp.demo}</b>
          </div>
        )}

        {verify ? (
          <form action={verifyCodeAction} className="stack">
            <input type="hidden" name="campus" value={campus} />
            <input type="hidden" name="email" value={sp.email} />
            <input type="hidden" name="next" value={next} />
            <div className="field">
              <label htmlFor="code">Code</label>
              <input
                id="code"
                className="input"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                defaultValue={sp.demo ?? ""}
                autoFocus
                style={{ fontSize: 22, letterSpacing: "0.3em", textAlign: "center", fontFamily: "var(--font-mono)" }}
              />
            </div>
            <button className="btn btn-primary btn-lg btn-block">Verify &amp; sign in</button>
            <a href={`/c/${campus}/login`} className="faint small" style={{ textAlign: "center" }}>
              Use a different email
            </a>
          </form>
        ) : (
          <form action={requestCodeAction} className="stack">
            <input type="hidden" name="campus" value={campus} />
            <input type="hidden" name="next" value={next} />
            <div className="field">
              <label htmlFor="email">School email</label>
              <input id="email" className="input" name="email" type="email" defaultValue={sp.email} placeholder={`you@${tenant.email_domains.at(-1)}`} required autoFocus />
            </div>
            <button className="btn btn-primary btn-lg btn-block">Email me a code</button>
          </form>
        )}

        {!verify && demoUsers.length > 0 && (
          <div className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 18 }}>
            <span className="mono">Demo · sign in as a seeded {tenant.short_name} student</span>
            {demoUsers.map((u) => (
              <form key={u.id} action={demoSignInAction}>
                <input type="hidden" name="campus" value={campus} />
                <input type="hidden" name="email" value={u.email} />
                <input type="hidden" name="next" value={next} />
                <button className="btn btn-block" style={{ justifyContent: "flex-start", height: 48 }}>
                  <span className="avatar" style={{ background: avatarColor(u.id), width: 28, height: 28, fontSize: 11 }}>
                    {initials(u.name)}
                  </span>
                  {u.name}
                  <span className="faint small" style={{ marginLeft: "auto", fontWeight: 500 }}>
                    {u.email}
                  </span>
                </button>
              </form>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
