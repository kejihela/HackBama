import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { threadsFor } from "@/lib/queries";
import { avatarColor, initials, timeAgo } from "@/lib/format";

export default async function Messages({ params }: { params: Promise<{ campus: string }> }) {
  const { campus } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/c/${campus}/login?next=/c/${campus}/messages`);
  const threads = await threadsFor(viewer.id);

  return (
    <main className="wrap page stack-lg" style={{ maxWidth: 760 }}>
      <h1>Messages</h1>
      {threads.length === 0 ? (
        <div className="empty">No conversations yet. Message a seller from any listing.</div>
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          {threads.map((t) => (
            <Link key={t.id} href={`/c/${campus}/messages/${t.id}`} className="thread-row">
              <span className="avatar" style={{ background: t.cycle_id ? "var(--ok)" : avatarColor(t.other_name ?? "?") }}>
                {t.cycle_id ? "↻" : initials(t.other_name ?? "?")}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block" }}>{t.title}</b>
                <span className="faint small" style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.other_name} · {t.last_body ?? "No messages yet"}
                </span>
              </span>
              <span className="faint small">{timeAgo(t.last_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
