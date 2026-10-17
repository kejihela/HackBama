"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createListingAction, type SellState } from "@/app/c/[campus]/actions";

type Check = { status: "idle" | "approved" | "review" | "rejected"; verdict?: string; message?: string };

export function SellForm({
  campus,
  homeName,
  categories,
  meetupSpot,
  defaultCategory,
  defaultVisibility,
}: {
  campus: string;
  homeName: string;
  categories: { key: string; label: string }[];
  meetupSpot: string;
  defaultCategory: string;
  defaultVisibility: string;
}) {
  const [state, formAction, pending] = useActionState<SellState, FormData>(createListingAction, {});
  const [check, setCheck] = useState<Check>({ status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const f = state.fields ?? {};

  function runCheck() {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!formRef.current) return;
      const fd = new FormData(formRef.current);
      const p = new URLSearchParams();
      for (const k of ["title", "category", "mode", "price", "description"]) p.set(k, String(fd.get(k) ?? ""));
      try {
        const res = await fetch(`/api/price-check?${p}`, { cache: "no-store" });
        if (res.ok) setCheck(await res.json());
      } catch {
        /* offline: the server still checks on submit */
      }
    }, 450);
  }

  useEffect(() => {
    if (state.fields) runCheck();
    return () => clearTimeout(timer.current);
  }, [state]);

  const tone = check.status === "rejected" ? "bad" : check.status === "review" ? "warn" : check.status === "approved" ? "good" : "";

  return (
    <form ref={formRef} action={formAction} onChange={runCheck} className="panel stack-lg" style={{ padding: 28 }}>
      <input type="hidden" name="campus" value={campus} />
      <div className="stack" style={{ gap: 6 }}>
        <span className="mono">New listing · posted to {homeName}</span>
        <h1 style={{ fontSize: 30 }}>What are you letting go of?</h1>
        <p className="muted">
          List it for cash, for trade, or both. Every listing is checked before it goes live: the item has to be allowed on campus,
          and the price has to be in a reasonable range.
        </p>
      </div>

      {state.error && <div className="alert error">{state.error}</div>}
      {state.rejected && (
        <div className="verify verify-bad">
          <span className="mono" style={{ color: "inherit" }}>Listing check · not accepted</span>
          <b>{state.rejected}</b>
          <span className="small">Edit the listing and try again. See the campus marketplace policy for what can be sold.</span>
        </div>
      )}

      <div className="form-grid">
        <div className="field full">
          <label htmlFor="title">Title</label>
          <input id="title" name="title" className="input" required maxLength={120} defaultValue={f.title} placeholder="e.g. Mini fridge, 3.1 cu ft" />
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <select id="category" name="category" className="select" defaultValue={f.category ?? defaultCategory}>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="course_code">Course code (optional)</label>
          <input id="course_code" name="course_code" className="input" defaultValue={f.course_code} placeholder="CH 101" />
          <span className="hint">Matches your book with students taking the course next term.</span>
        </div>

        <div className="field full">
          <label>How do you want to deal?</label>
          <div className="segmented" style={{ alignSelf: "flex-start" }}>
            {[
              ["both", "Cash or trade"],
              ["sell", "Cash only"],
              ["trade", "Trade only"],
            ].map(([v, label]) => (
              <label key={v}>
                <input type="radio" name="mode" value={v} defaultChecked={(f.mode ?? "both") === v} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="price">Price ($)</label>
          <input id="price" name="price" className="input" inputMode="decimal" defaultValue={f.price} placeholder="45" />
          <span className="hint">Leave blank for trade only. Enter 0 to give it away.</span>
        </div>
        <div className="field">
          <label htmlFor="image">Photo</label>
          <input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="input" />
          {state.fields && <span className="hint">Re-attach your photo if you added one.</span>}
        </div>

        {check.status !== "idle" && check.message && (
          <div className={`verify verify-${tone} full`} aria-live="polite">
            <span className="mono" style={{ color: "inherit" }}>
              Live check · {check.status === "rejected" ? "not allowed" : check.verdict === "fair" ? "fair price" : check.verdict === "free" ? "free" : "needs a look"}
            </span>
            <span>{check.message}</span>
          </div>
        )}

        <div className="field full">
          <label htmlFor="description">Details</label>
          <textarea id="description" name="description" className="textarea" maxLength={2000} defaultValue={f.description} placeholder="Condition, edition, pickup details…" />
          <span className="hint">Don&apos;t include your phone number, email or room number. Buyers message you in the app.</span>
        </div>
        <div className="field full">
          <label>Who can see it?</label>
          <div className="segmented" style={{ alignSelf: "flex-start" }}>
            <label>
              <input type="radio" name="visibility" value="campus" defaultChecked={(f.visibility ?? defaultVisibility) !== "network"} />
              <span>{homeName} only</span>
            </label>
            <label>
              <input type="radio" name="visibility" value="network" defaultChecked={(f.visibility ?? defaultVisibility) === "network"} />
              <span>Every campus</span>
            </label>
          </div>
          <span className="hint">Cross-campus listings show up for students at other schools, which is great for tickets, rides and game-day stays.</span>
        </div>
      </div>

      {state.priceIssue && (
        <div className="verify verify-warn">
          <span className="mono" style={{ color: "inherit" }}>Price check · held</span>
          <b>{state.priceIssue}</b>
          <div className="row" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-sm" onClick={() => (document.getElementById("price") as HTMLInputElement)?.focus()}>
              Change the price
            </button>
            <button className="btn btn-sm btn-ink" name="request_review" value="1" disabled={pending}>
              Send to a moderator instead
            </button>
          </div>
          <span className="small">Moderator-reviewed listings go live once approved, usually within a few hours.</span>
        </div>
      )}

      <div className="row between">
        <span className="faint small">Exchanges happen in person at safe spots like {meetupSpot}.</span>
        <button className="btn btn-primary btn-lg" disabled={pending}>
          {pending ? "Checking…" : "Post listing"}
        </button>
      </div>
    </form>
  );
}
