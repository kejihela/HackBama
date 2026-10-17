"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createTenant, validateTenant, type NewTenantInput } from "@/lib/tenant";
import { adminSignIn, adminSignOut, isAdmin } from "@/lib/admin";
import { resolveDispute } from "@/lib/escrow";
import { decideReview } from "@/lib/moderation";
import { runMatcher } from "@/lib/matching";

const list = (s: string) => s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin");
}

export async function adminLoginAction(f: FormData) {
  if (!(await adminSignIn(s(f, "key")))) redirect(`/admin?error=${encodeURIComponent("Wrong admin key.")}`);
  redirect("/admin/escrow");
}

export async function adminLogoutAction() {
  await adminSignOut();
  redirect("/");
}

export async function launchCampusAction(f: FormData) {
  await requireAdmin();
  const input: NewTenantInput = {
    id: s(f, "id").toLowerCase(),
    name: s(f, "name"),
    short_name: s(f, "short_name"),
    mascot: s(f, "mascot"),
    city: s(f, "city"),
    email_domains: list(s(f, "email_domains").toLowerCase()),
    primary_color: s(f, "primary_color"),
    accent_color: s(f, "accent_color"),
    meetup_spots: list(s(f, "meetup_spots")),
    logo: s(f, "logo") || undefined,
  };
  const err = await validateTenant(input);
  if (err) redirect(`/admin/campuses?error=${encodeURIComponent(err)}`);
  await createTenant(input);
  revalidatePath("/");
  redirect(`/c/${input.id}?launched=1`);
}

export async function resolveDisputeAction(f: FormData) {
  await requireAdmin();
  const decision = s(f, "decision") === "release" ? "release" : "refund";
  const r = await resolveDispute(Number(s(f, "order")), decision, s(f, "note"));
  if (decision === "refund" && r.ok) await runMatcher();
  redirect(`/admin/escrow${r.ok ? "" : `?error=${encodeURIComponent(r.error)}`}`);
}

export async function reviewListingAction(f: FormData) {
  await requireAdmin();
  const approve = s(f, "decision") === "approve";
  if (await decideReview(Number(s(f, "listing")), approve, s(f, "note")) && approve) await runMatcher();
  revalidatePath("/", "layout");
  redirect("/admin/review");
}
