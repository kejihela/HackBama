import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { canAccessThread, messagesIn, sendMessage, threadTitle } from "@/lib/queries";
import { screenMessage } from "@/lib/moderation";

type Ctx = { params: Promise<{ id: string }> };

async function authorize(ctx: Ctx) {
  const viewer = await getViewer();
  const threadId = Number((await ctx.params).id);
  if (!viewer || !await canAccessThread(threadId, viewer.id)) return null;
  return { viewer, threadId };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const a = await authorize(ctx);
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  const after = Number(req.nextUrl.searchParams.get("after") ?? 0) || 0;
  return NextResponse.json(await messagesIn(a.threadId, after));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const a = await authorize(ctx);
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { body, after } = (await req.json().catch(() => ({}))) as { body?: string; after?: number };
  if (!body?.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });
  // Safety screen runs server-side, so a modified client can't skip it.
  const blocked = await screenMessage(a.viewer.id, body, a.threadId, (await threadTitle(a.threadId))?.title);
  if (blocked) return NextResponse.json({ blocked }, { status: 422 });
  await sendMessage(a.threadId, a.viewer.id, body.trim());
  return NextResponse.json(await messagesIn(a.threadId, Number(after) || 0));
}
