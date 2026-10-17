import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { getProfile, trustOf } from "@/lib/trust";
import { listingsBySeller } from "@/lib/queries";
import { avatarColor, initials } from "@/lib/format";
import { formatMinutes } from "@/lib/trust-score";
import { TrustBadge } from "@/components/TrustBadge";
import { ListingCard } from "@/components/ListingCard";

type Props = { params: Promise<{ campus: string; id: string }> };

export default async function Profile({ params }: Props) {
  const { campus, id } = await params;
  const viewer = await getViewer();
  const person = await getProfile(Number(id));
  if (!person) notFound();
  const trust = (await trustOf(person.id))!;
  const isMe = viewer?.id === person.id;
  // Only listings this viewer is allowed to see: their own campus, or shared with every campus.
  const listings = (await listingsBySeller(person.id)).filter(
    (l) => l.status === "active" && (l.tenant_id === viewer?.tenant_id || l.visibility === "network"),
  );
  const since = new Date(person.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const ring = 2 * Math.PI * 52;

  return (
    <main className="wrap page stack-lg">
      <section className="panel profile">
        <div className="profile-id">
          <span className="avatar" style={{ background: avatarColor(person.id), width: 72, height: 72, fontSize: 26 }}>
            {initials(person.name)}
          </span>
          <div className="stack" style={{ gap: 6 }}>
            <h1 style={{ fontSize: 30 }}>
              {person.name}
              {isMe && <span className="faint" style={{ fontSize: 16, fontWeight: 500 }}> (you)</span>}
            </h1>
            <div className="row" style={{ gap: 8 }}>
              <span className="badge campus-tag" style={{ background: person.campus_color }}>{person.campus}</span>
              <span className="badge trade">✓ Verified student email</span>
              <span className="faint small">Member since {since}</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <TrustBadge trust={trust} />
              {trust.badges.map((b) => (
                <span key={b} className="badge">{b}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="trust-ring" aria-label={`Trust score ${trust.score} out of 100`}>
          <svg viewBox="0 0 120 120" width="132" height="132">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-2)" strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              className={`ring-${trust.level}`}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${(trust.score / 100) * ring} ${ring}`}
              transform="rotate(-90 60 60)"
            />
            <text x="60" y="62" textAnchor="middle" fontSize="32" fontWeight="900" fill="var(--ink)" style={{ fontFamily: "var(--font-display)" }}>
              {trust.score}
            </text>
            <text x="60" y="82" textAnchor="middle" fontSize="10" fill="var(--ink-3)" letterSpacing="1">
              TRUST SCORE
            </text>
          </svg>
        </div>
      </section>

      <div className="detail" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
        <section className="panel stack">
          <h3>How this score is calculated</h3>
          <p className="faint small">Only from what {isMe ? "you've" : `${person.name.split(" ")[0]} has`} actually done on CampusLoop.</p>
          <table className="breakdown">
            <tbody>
              {trust.breakdown.map((b) => (
                <tr key={b.label}>
                  <td>{b.label}</td>
                  <td className={b.points < 0 ? "neg" : "pos"}>{b.points > 0 ? `+${b.points}` : b.points}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Trust score</td>
                <td>{trust.score}/100</td>
              </tr>
            </tbody>
          </table>
          <dl className="kv small">
            <dt>Completed deals</dt>
            <dd>{trust.deals}</dd>
            <dt>Typical reply time</dt>
            <dd>{trust.medianReplyMinutes === null ? "No buyer messages yet" : formatMinutes(trust.medianReplyMinutes)}</dd>
          </dl>
          {isMe && (
            <p className="small muted">
              Raise your score by finishing deals through escrow and replying to buyers quickly. Disputes you lose and blocked
              messages lower it.
            </p>
          )}
        </section>

        <section className="stack">
          <h2>{isMe ? "Your listings" : `${person.name.split(" ")[0]}'s listings`}</h2>
          {listings.length ? (
            <div className="grid">
              {listings.map((l) => (
                <ListingCard key={l.id} l={l} site={campus} />
              ))}
            </div>
          ) : (
            <div className="empty">
              No active listings{isMe ? "." : " you can see."}{" "}
              {isMe && <Link href={`/c/${campus}/sell`} style={{ textDecoration: "underline" }}>List something</Link>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
