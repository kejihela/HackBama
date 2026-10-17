import Link from "next/link";
import type { TrustResult } from "@/lib/trust-score";

/** Compact trust pill: shield, level and score. Hover shows how the score was built. */
export function TrustBadge({ trust, href, compact }: { trust: TrustResult; href?: string; compact?: boolean }) {
  const tip = trust.breakdown.map((b) => `${b.points > 0 ? "+" : ""}${b.points}  ${b.label}`).join("\n") + `\n= ${trust.score}/100`;
  const body = (
    <span className={`trust trust-${trust.level}`} title={tip}>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3 4 6v6c0 5 3.4 8.5 8 9 4.6-.5 8-4 8-9V6l-8-3Z" />
        {trust.level !== "caution" && <path d="m8.5 12 2.5 2.5 4.5-5" />}
      </svg>
      {trust.label}
      {!compact && <b>{trust.score}</b>}
    </span>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
