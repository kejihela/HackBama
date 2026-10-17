import { recentFlags } from "@/lib/moderation";
import { MODERATION_INFO, type ModerationCategory } from "@/lib/safety";
import { aiModerationEnabled, groqModels, moderationModel, moderationProvider } from "@/lib/ai-moderation";
import { timeAgo } from "@/lib/format";

export default async function SafetyLog() {
  const flags = await recentFlags();
  const blockedFlags = flags.filter((f) => f.action === "blocked");
  const reviewFlags = flags.filter((f) => f.action === "review");
  const counts = blockedFlags.reduce<Record<string, number>>((m, f) => ((m[f.category] = (m[f.category] ?? 0) + 1), m), {});
  const repeat = Object.entries(blockedFlags.reduce<Record<string, number>>((m, f) => ((m[f.user_name] = (m[f.user_name] ?? 0) + 1), m), {}))
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1]);

  return (
    <main className="wrap page stack-lg">
      <div className="stack" style={{ gap: 6 }}>
        <span className="mono">Message &amp; listing safety screen</span>
        <h1>Safety log</h1>
        <p className="muted" style={{ maxWidth: 640 }}>Everything the screen stopped before it reached another student. The sender saw a caution and nothing was delivered.</p>
      </div>
      <div className={`alert ${aiModerationEnabled() ? "success" : "info"}`}>
        {aiModerationEnabled() ? (
          <><b>AI screen on</b> ({moderationProvider() === "groq" ? `gpt-oss on Groq · ${groqModels().map((m) => m.replace("openai/", "")).join(" → ")}` : `${moderationProvider() === "openai" ? "OpenAI" : "Claude"} · ${moderationModel()}`}). Rules run first; the model judges meaning, clears keyword false positives and catches what rules miss. Only high-confidence calls block; unsure ones are delivered and listed under “Needs a look”.</>
        ) : (
          <><b>AI screen off.</b> Using keyword rules only. Set <code>OPENAI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code> and restart to turn on the AI classifier.</>
        )}
      </div>
      <div className="stat-row">
        {(Object.keys(MODERATION_INFO) as ModerationCategory[]).map((c) => (
          <div key={c} className="stat">
            <b>{counts[c] ?? 0}</b>
            <span className="faint small">{MODERATION_INFO[c].label}</span>
          </div>
        ))}
      </div>
      {repeat.length > 0 && (
        <div className="alert error">
          <b>Repeat offenders:</b> {repeat.map(([n, c]) => `${n} (${c})`).join(", ")}. Accounts are paused automatically after 5 blocks in 24 hours.
        </div>
      )}
      {reviewFlags.length > 0 && (
        <section className="stack">
          <h2>Needs a look</h2>
          <p className="faint small">The AI thought these might break the rules but wasn&apos;t confident, so they were delivered.</p>
          <div className="panel" style={{ padding: 0 }}>
            {reviewFlags.map((f) => (
              <div key={f.id} className="thread-row" style={{ alignItems: "flex-start" }}>
                <span className={`badge flag-${f.category}`}>{MODERATION_INFO[f.category as ModerationCategory]?.label ?? f.category}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{f.user_name}</b> <span className="faint small">· {f.context} · {f.reason}</span>
                  <span className="small muted" style={{ display: "block", overflowWrap: "anywhere" }}>“{f.excerpt}”</span>
                </span>
                <span className="faint small">{timeAgo(f.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <h2>Blocked</h2>
      {blockedFlags.length === 0 ? (
        <div className="empty">Nothing blocked yet. Try sending “venmo me” or a phone number in a chat.</div>
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          {blockedFlags.map((f) => (
            <div key={f.id} className="thread-row" style={{ alignItems: "flex-start" }}>
              <span className={`badge flag-${f.category}`}>{MODERATION_INFO[f.category as ModerationCategory]?.label ?? f.category}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{f.user_name}</b> <span className="faint small">· {f.user_email} · {f.context} · {f.reason} · {f.source === "ai" ? "AI" : f.source === "rules-fallback" ? "rules (AI unavailable)" : "rules"}</span>
                <span className="small muted" style={{ display: "block", overflowWrap: "anywhere" }}>“{f.excerpt}”</span>
              </span>
              <span className="faint small">{timeAgo(f.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
