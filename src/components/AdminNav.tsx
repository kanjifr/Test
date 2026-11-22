"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type AdminTab = { href: string; label: string; icon: string; badge?: number };

/** Onglets du panel admin (barre latérale sur ordinateur, défilante sur téléphone). */
export function AdminNav({ tabs }: { tabs: AdminTab[] }) {
  const path = usePathname();
  return (
    <nav className="admin-nav" aria-label="Sections du panel admin">
      {tabs.map((t) => {
        const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <span className="admin-nav-icon" aria-hidden>
              {t.icon}
            </span>
            <span>{t.label}</span>
            {t.badge ? <span className="admin-nav-badge">{t.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
