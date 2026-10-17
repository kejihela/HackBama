import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { canAccessThread, messagesIn, threadTitle } from "@/lib/queries";
import { getCycle } from "@/lib/matching";
import { getTenant } from "@/lib/tenant";
import { Chat } from "@/components/Chat";

export default async function Thread({ params }: { params: Promise<{ campus: string; id: string }> }) {
  const { campus, id } = await params;
  const threadId = Number(id);
  const viewer = await getViewer();
  if (!viewer) redirect(`/c/${campus}/login?next=/c/${campus}/messages/${id}`);
  if (!await canAccessThread(threadId, viewer.id)) notFound();
  const info = (await threadTitle(threadId))!;
  const cycle = info.cycle_id ? await getCycle(info.cycle_id) : null;
  const spots = (await getTenant(viewer.tenant_id))!.meetup_spots;

  return (
    <main className="wrap page stack" style={{ maxWidth: 760 }}>
      <Link href={`/c/${campus}/messages`} className="faint small">← All messages</Link>
      <div className="row between">
        <h2>
          {info.listing_id ? <Link href={`/c/${campus}/listing/${info.listing_id}`}>{info.title}</Link> : info.title}
        </h2>
        {cycle && <Link href={`/c/${campus}/loops`} className="badge trade">{cycle.legs.length}-way loop · {cycle.status === "completed" ? "locked in" : "proposed"}</Link>}
      </div>
      {cycle && (
        <p className="small muted">
          {cycle.legs.map((l) => `${l.giver_name.split(" ")[0]} → ${l.receiver_name.split(" ")[0]}: ${l.listing_title}`).join("  ·  ")}
        </p>
      )}
      <Chat threadId={threadId} meId={viewer.id} initial={await messagesIn(threadId)} />
      <p className="faint small">Suggested meetup spots: {spots.join(" · ")}</p>
    </main>
  );
}
