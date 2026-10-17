"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { signOutToLandingAction } from "@/app/c/[campus]/actions";

function LoopMark() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/campusloop-mark.svg" alt="" width={30} height={30} style={{ borderRadius: 8, boxShadow: "0 0 0 1.5px rgba(255,255,255,0.35)" }} />;
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
