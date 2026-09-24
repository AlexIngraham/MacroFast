"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/foods", label: "Find food" },
  { href: "/restaurants", label: "Restaurants" },
  { href: "/compare", label: "Compare" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="MacroFast home">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>MacroFast</span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}>
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
