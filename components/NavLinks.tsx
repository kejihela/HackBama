"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string; count?: number; exact?: boolean }[] }) {
  const path = usePathname();
  return (
    <nav className="nav">
      {links.map((l) => {
        const active = l.exact ? path === l.href : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""}>
            {l.label}
            {!!l.count && <span className="count">{l.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
