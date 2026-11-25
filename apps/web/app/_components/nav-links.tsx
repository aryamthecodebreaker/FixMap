"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/docs", label: "Docs" },
  { href: "/evidence", label: "Evidence" },
  { href: "/changelog", label: "Changelog" }
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="site-nav" aria-label="Primary">
      {links.map((link) => (
        <Link key={link.href} href={link.href} aria-current={pathname.startsWith(link.href) ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
