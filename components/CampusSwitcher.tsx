"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type CampusOption = { id: string; short_name: string; city: string; logo: string | null; primary_color: string };

/** Top-bar menu: jump to another campus, or back to the campus selection page. */
export function CampusSwitcher({ current, campuses }: { current: string; campuses: CampusOption[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const path = usePathname();

  // Close after navigating, on a click outside, or on Escape.
  useEffect(() => {
    ref.current?.removeAttribute("open");
  }, [path]);
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      const d = ref.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) d.removeAttribute("open");
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details className="switcher" ref={ref}>
      <summary aria-label="Switch campus" title="Switch campus">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
        </svg>
        <span className="hide-sm">Campuses</span>
      </summary>
      <div className="switcher-menu" role="menu">
        <span className="mono" style={{ padding: "4px 12px 8px" }}>Campuses</span>
        {campuses.map((c) => (
          <Link key={c.id} href={`/c/${c.id}`} role="menuitem" className={`switcher-item ${c.id === current ? "current" : ""}`} aria-current={c.id === current ? "page" : undefined}>
            {c.logo ? (
              <span className="campus-logo" style={{ width: 30, height: 30 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.logo} alt="" />
              </span>
            ) : (
              <span className="swatch-dot" style={{ background: c.primary_color }} />
            )}
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{c.short_name}</b>
              <span className="faint small" style={{ display: "block" }}>{c.city}</span>
            </span>
            {c.id === current && <span className="badge">Current</span>}
          </Link>
        ))}
        <Link href="/" role="menuitem" className="switcher-item switcher-all">
          ← All campuses
        </Link>
      </div>
    </details>
  );
}
