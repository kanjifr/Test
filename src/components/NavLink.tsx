"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Lien du menu, mis en surbrillance quand on est sur sa page. */
export function NavLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} className={`${className ?? ""} ${active ? "active" : ""}`.trim()} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
