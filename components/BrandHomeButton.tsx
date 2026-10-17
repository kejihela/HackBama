"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { signOutToLandingAction } from "@/app/c/[campus]/actions";

function LoopMark() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="#F3EFE6" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="#151413" strokeWidth="3" strokeDasharray="40 14" strokeLinecap="round" transform="rotate(-40 16 16)" />
      <path d="M21.6 6.6 24.4 10.8 19.4 11.4z" fill="#151413" />
      <circle cx="16" cy="7.5" r="2.6" fill="#9E1B32" />
    </svg>
  );
}

function YesButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-ink" disabled={pending}>
      {pending ? "Logging out…" : "Yes, log out"}
    </button>
  );
}

/**
 * The CampusLoop logo, top left. Signed in: asks to confirm logging out, then returns to
 * campus selection. Signed out: there's nothing to log out of, so it just goes there.
 */
export function BrandHomeButton({ signedIn, name }: { signedIn: boolean; name?: string }) {
  const [open, setOpen] = useState(false);
  const noRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    noRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  const body = (
    <>
      <LoopMark />
      <span className="brand-word hide-sm">CampusLoop</span>
    </>
  );

  if (!signedIn) {
    return (
      <Link href="/" className="brand-home" title="CampusLoop: back to campus selection">
        {body}
      </Link>
    );
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="brand-home" onClick={() => setOpen(true)} aria-haspopup="dialog" title="CampusLoop: log out and pick a campus">
        {body}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal confirm" role="dialog" aria-modal="true" aria-labelledby="logout-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="logout-title">Log out and go back to campus selection?</h3>
            <p className="muted small">
              {name ? `You’re signed in as ${name}. ` : ""}You’ll need your school email to sign in again.
            </p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
              <button ref={noRef} type="button" className="btn" onClick={close}>
                No, stay here
              </button>
              <form action={signOutToLandingAction}>
                <YesButton />
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
