"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { put } from "@vercel/blob";
import fs from "node:fs/promises";
import path from "node:path";
import { demoSignIn, getViewer, requestCode, signOut, verifyCode, type Viewer } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { ALL_CATEGORY_KEYS } from "@/lib/categories";
import { normalizeCourse } from "@/lib/cycles";
import { acceptCycle, declineCycle, runMatcher, voidCyclesWithListings } from "@/lib/matching";
import { verifyNewListing, screenMessage } from "@/lib/moderation";
import { cancelBySeller, holdPayment, openDispute, releaseByBuyer } from "@/lib/escrow";
import { money } from "@/lib/format";
import {
  addWant,
  createListing,
  getListing,
  openListingThread,
  removeWant,
  sendMessage,
  setListingStatus,
} from "@/lib/queries";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const campusOf = async (f: FormData) => {
  const c = str(f, "campus");
  if (!(await getTenant(c))) redirect("/");
  return c;
};
const safeNext = (n: string, fallback: string) => (n.startsWith("/c/") ? n : fallback);
const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();

async function requireViewer(campus: string, next: string): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(`/c/${campus}/login?${qs({ next })}`);
  return v;
}

// ---------- Auth ----------

export async function requestCodeAction(f: FormData) {
  const campus = await campusOf(f);
  const email = str(f, "email");
  const next = str(f, "next");
  const r = await requestCode(email);
  if (!r.ok) redirect(`/c/${campus}/login?${qs({ error: r.error, email, next })}`);
  const params: Record<string, string> = { step: "verify", email, next };
  if (r.demoCode) params.demo = r.demoCode;
  redirect(`/c/${r.tenant.id}/login?${qs(params)}`);
}

export async function verifyCodeAction(f: FormData) {
  const campus = await campusOf(f);
  const email = str(f, "email");
  const next = str(f, "next");
  const r = await verifyCode(email, str(f, "code"));
  if (!r.ok) redirect(`/c/${campus}/login?${qs({ step: "verify", email, next, error: r.error })}`);
  redirect(safeNext(next, `/c/${r.user.tenant_id}`));
}

export async function demoSignInAction(f: FormData) {
  const campus = await campusOf(f);
  const v = await demoSignIn(str(f, "email"));
  if (!v) redirect(`/c/${campus}/login?${qs({ error: "Demo sign-in is disabled." })}`);
  redirect(safeNext(str(f, "next"), `/c/${v.tenant_id}`));
}

export async function signOutAction(f: FormData) {
  const campus = await campusOf(f);
  await signOut();
  redirect(`/c/${campus}`);
}

// ---------- Listings ----------

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export type SellState = {
  error?: string;
  rejected?: string;
  priceIssue?: string;
  fields?: Record<string, string>;
};

const SELL_FIELDS = ["title", "category", "mode", "price", "visibility", "course_code", "description"];

export async function createListingAction(_prev: SellState, f: FormData): Promise<SellState> {
  const campus = await campusOf(f);
  const v = await requireViewer(campus, `/c/${campus}/sell`);
  const fields = Object.fromEntries(SELL_FIELDS.map((k) => [k, str(f, k)]));
  const fail = (s: Omit<SellState, "fields">): SellState => ({ ...s, fields });

  const title = fields.title.slice(0, 120);
  const description = fields.description.slice(0, 2000);
  const { category, mode } = fields;
  const visibility = fields.visibility === "network" ? "network" : "campus";
  if (title.length < 3) return fail({ error: "Give your listing a title." });
  if (!ALL_CATEGORY_KEYS.includes(category as never)) return fail({ error: "Pick a category." });
  if (!["sell", "trade", "both"].includes(mode)) return fail({ error: "Pick how you want to deal." });
  let price: number | null = null;
  if (mode !== "trade") {
    const n = Number(fields.price.replace(/[$,]/g, ""));
    if (!fields.price || !Number.isFinite(n) || n < 0 || n > 100000) return fail({ error: "Enter a price (0 for free)." });
    price = Math.round(n * 100);
  }
  const course = fields.course_code ? normalizeCourse(fields.course_code) : null;
  if (fields.course_code && !course) return fail({ error: `"${fields.course_code}" doesn't look like a course code. Try something like CH 101.` });

  // Verification gate: allowed product, safe text, reasonable price.
  const check = await verifyNewListing(v.id, { title, description, category, price_cents: price });
  if (check.status === "rejected") return fail({ rejected: check.reason });
  const wantsReview = str(f, "request_review") === "1";
  if (check.status === "review" && !wantsReview) return fail({ priceIssue: check.reason });

  const file = f.get("image");
  let image: string | null = null;
  if (file instanceof File && file.size > 0) {
    const ext = IMAGE_TYPES[file.type];
    if (!ext) return fail({ error: "Photos must be JPG, PNG, WebP or GIF." });
    if (file.size > 5 * 1024 * 1024) return fail({ error: "Photos must be under 5 MB." });
    const name = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      // Production (Vercel): store in Vercel Blob; the listing keeps the public URL.
      image = (await put(`listings/${name}`, file, { access: "public", contentType: file.type })).url;
    } else {
      // Local dev: data/uploads, served by /api/uploads.
      await fs.writeFile(path.join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
      image = name;
    }
  }

  const pc = check.price;
  // You list on your own campus, even when browsing another school's site.
  const id = await createListing({
    tenant_id: v.tenant_id,
    seller_id: v.id,
    category,
    mode,
    title,
    description,
    price_cents: price,
    course_code: course,
    image,
    visibility,
    status: check.status === "review" ? "review" : "active",
    price_check: pc?.verdict ?? null,
    price_low: pc?.low ?? null,
    price_high: pc?.high ?? null,
    price_basis: pc?.basis ?? null,
    review_note: check.status === "review" ? check.reason : null,
  });
  revalidatePath(`/c/${campus}`, "layout");
  if (check.status === "review") redirect(`/c/${v.tenant_id}/listing/${id}?review=1`);
  const loops = mode === "sell" ? [] : await runMatcher();
  if (loops.length) redirect(`/c/${v.tenant_id}/loops?${qs({ found: loops.join(",") })}`);
  redirect(`/c/${v.tenant_id}/listing/${id}?created=1`);
}

export async function setListingStatusAction(f: FormData) {
  const campus = await campusOf(f);
  const id = Number(str(f, "id"));
  const v = await requireViewer(campus, `/c/${campus}/listing/${id}`);
  const status = str(f, "status") === "sold" ? "sold" : "active";
  if (await setListingStatus(id, v.id, status)) {
    if (status === "sold") await voidCyclesWithListings([id]);
    else await runMatcher();
  }
  revalidatePath(`/c/${campus}`, "layout");
  redirect(`/c/${campus}/listing/${id}`);
}

// ---------- Wants & loops ----------

export async function addWantAction(f: FormData) {
  const campus = await campusOf(f);
  const v = await requireViewer(campus, `/c/${campus}/loops`);
  const category = str(f, "category") || "any";
  const keywords = str(f, "keywords").slice(0, 120);
  const courseRaw = str(f, "course_code");
  const course = courseRaw ? normalizeCourse(courseRaw) : null;
  if (courseRaw && !course) redirect(`/c/${campus}/loops?${qs({ error: `"${courseRaw}" isn't a course code like CH 101.` })}`);
  if (!keywords && !course && category === "any")
    redirect(`/c/${campus}/loops?${qs({ error: "Say what you're looking for: a keyword, a course or a category." })}`);
  await addWant(v.id, v.tenant_id, category === "any" || ALL_CATEGORY_KEYS.includes(category as never) ? category : "any", keywords, course);
  const loops = await runMatcher();
  revalidatePath(`/c/${campus}`, "layout");
  redirect(`/c/${campus}/loops${loops.length ? `?${qs({ found: loops.join(",") })}` : "?added=1"}`);
}

export async function removeWantAction(f: FormData) {
  const campus = await campusOf(f);
  const v = await requireViewer(campus, `/c/${campus}/loops`);
  await removeWant(Number(str(f, "id")), v.id);
  redirect(`/c/${campus}/loops`);
}

export async function acceptLoopAction(f: FormData) {
  const campus = await campusOf(f);
  const v = await requireViewer(campus, `/c/${campus}/loops`);
  const r = await acceptCycle(Number(str(f, "id")), v.id);
  revalidatePath(`/c/${campus}`, "layout");
  redirect(`/c/${campus}/loops${r === "completed" ? `?locked=${str(f, "id")}` : ""}`);
}

export async function declineLoopAction(f: FormData) {
  const campus = await campusOf(f);
  const v = await requireViewer(campus, `/c/${campus}/loops`);
  await declineCycle(Number(str(f, "id")), v.id);
  revalidatePath(`/c/${campus}`, "layout");
  redirect(`/c/${campus}/loops`);
}

// ---------- Messaging ----------

export async function contactSellerAction(f: FormData) {
  const campus = await campusOf(f);
  const id = Number(str(f, "listing"));
  const v = await requireViewer(campus, `/c/${campus}/listing/${id}`);
  const l = await getListing(id, v.tenant_id);
  if (!l || l.seller_id === v.id) redirect(`/c/${campus}/listing/${id}`);
  const body = str(f, "body");
  const blocked = body ? await screenMessage(v.id, body, null, l.title) : null;
  if (blocked) redirect(`/c/${campus}/listing/${id}?${qs({ blocked: blocked.category, reason: blocked.reason, strikes: String(blocked.strikes), suspended: blocked.suspended ? "1" : "" })}`);
  const thread = await openListingThread(id, v.id);
  if (body) await sendMessage(thread, v.id, body);
  redirect(`/c/${campus}/messages/${thread}`);
}

// ---------- Escrow (CampusLoop Protect) ----------

export async function buyWithEscrowAction(f: FormData) {
  const campus = await campusOf(f);
  const id = Number(str(f, "listing"));
  const v = await requireViewer(campus, `/c/${campus}/listing/${id}`);
  if (str(f, "agree") !== "1") redirect(`/c/${campus}/listing/${id}?${qs({ buyError: "Confirm you've read how escrow works." })}`);
  const r = await holdPayment(id, v.id);
  if (!r.ok) redirect(`/c/${campus}/listing/${id}?${qs({ buyError: r.error })}`);
  const l = (await getListing(id, v.tenant_id))!;
  const thread = await openListingThread(id, v.id);
  await sendMessage(thread, v.id, `I paid ${money(l.price_cents)} into CampusLoop escrow for "${l.title}". When can we meet so I can check it out?`);
  revalidatePath(`/c/${campus}`, "layout");
  redirect(`/c/${campus}/orders/${r.id}?paid=1`);
}

export async function orderAction(f: FormData) {
  const campus = await campusOf(f);
  const id = Number(str(f, "order"));
  const v = await requireViewer(campus, `/c/${campus}/orders/${id}`);
  const action = str(f, "action");
  const r =
    action === "release"
      ? await releaseByBuyer(id, v.id)
      : action === "dispute"
        ? await openDispute(id, v.id, str(f, "reason"))
        : action === "cancel"
          ? await cancelBySeller(id, v.id)
          : ({ ok: false, error: "Unknown action." } as const);
  if (r.ok && action === "cancel") await runMatcher();
  revalidatePath(`/c/${campus}`, "layout");
  redirect(`/c/${campus}/orders/${id}${r.ok ? `?done=${action}` : `?${qs({ error: r.error })}`}`);
}
