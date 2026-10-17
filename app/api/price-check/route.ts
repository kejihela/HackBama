import { NextResponse, type NextRequest } from "next/server";
import { previewListing } from "@/lib/moderation";
import { priceMessage } from "@/lib/verification";

// Live price & product check for the sell form, called as the seller types.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const title = (p.get("title") ?? "").slice(0, 120);
  const category = p.get("category") ?? "other";
  const mode = p.get("mode") ?? "sell";
  const raw = (p.get("price") ?? "").replace(/[$,]/g, "");
  const n = Number(raw);
  const price = mode === "trade" || raw === "" || !Number.isFinite(n) ? null : Math.round(n * 100);
  if (title.trim().length < 3) return NextResponse.json({ status: "idle" });

  const r = await previewListing({ title, description: p.get("description") ?? "", category, price_cents: price });
  if (r.status === "rejected") return NextResponse.json({ status: "rejected", message: r.reason });
  if (!r.price) return NextResponse.json({ status: "idle" });
  return NextResponse.json({
    status: r.status,
    verdict: r.price.verdict,
    low: r.price.low,
    high: r.price.high,
    message: priceMessage(r.price),
  });
}
