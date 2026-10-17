import { MODERATION_INFO, type ModerationCategory } from "@/lib/safety";

const ICONS: Record<ModerationCategory, string> = {
  sexual: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  harassment: "M12 3 4 6v6c0 5 3.4 8.5 8 9 4.6-.5 8-4 8-9V6l-8-3Zm0 6v4m0 3h.01",
  privacy: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5V11Zm7 4v2",
  scam: "M3 7h18v10H3V7Zm4 5h.01M17 12h.01M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
  prohibited: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM5.6 5.6l12.8 12.8",
  offensive: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
};

export type CautionProps = {
  category: ModerationCategory;
  title?: string;
  guidance?: string;
  reason?: string;
  strikes?: number;
  limit?: number;
  suspended?: boolean;
  children?: React.ReactNode;
  source?: string;
};

/** The warning shown when the safety screen stops a message or listing. Styled per category. */
export function SafetyCaution({ category, title, guidance, reason, strikes, limit, suspended, children, source }: CautionProps) {
  const info = MODERATION_INFO[category];
  return (
    <div className={`caution caution-${suspended ? "suspended" : category}`} role="alert">
      <div className="caution-head">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={ICONS[category]} />
        </svg>
        <div>
          <span className="mono" style={{ color: "inherit", opacity: 0.8 }}>
            {source === "ai" ? "AI safety screen" : "Safety screen"} · {suspended ? "account paused" : info.label}
          </span>
          <h3>{title ?? info.title}</h3>
        </div>
      </div>
      {reason && !suspended && <p className="small"><b>Detected:</b> {reason}.</p>}
      <p>{guidance ?? info.guidance}</p>
      {!!strikes && !!limit && !suspended && (
        <p className="small" style={{ opacity: 0.85 }}>
          Warning {Math.min(strikes, limit)} of {limit} in the last 24 hours. At {limit}, messaging is paused for review.
        </p>
      )}
      {children}
    </div>
  );
}
