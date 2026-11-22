"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SoundToggle } from "@/components/SoundToggle";

export const MORE_EVENT = "kizuna:more";

export type MoreItem = { href: string; label: string; icon: string; badge?: number | string; highlight?: boolean };
export type MoreSection = { title: string; items: MoreItem[] };

/** Menu « Plus » : panneau qui monte du bas sur téléphone, menu déroulant sur ordinateur. */
export function MoreMenu({ sections, logout, total }: { sections: MoreSection[]; logout: () => Promise<void>; total: number }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener(MORE_EVENT, toggle);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener(MORE_EVENT, toggle);
      window.removeEventListener("keydown", esc);
    };
  }, []);
  // Pas de défilement de la page derrière le panneau
  useEffect(() => {
    document.documentElement.classList.toggle("more-open", open);
  }, [open]);

  return (
    <>
      <button type="button" className={`more-trigger desk-only ${open ? "on" : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Plus ▾{total > 0 && <span className="nav-badge">{total > 9 ? "9+" : total}</span>}
      </button>
      {/* Rendu dans <body> : le flou de la barre du haut enfermerait sinon le panneau */}
      {open && createPortal(
        <div className="more-backdrop" onClick={() => setOpen(false)}>
          <div className="more-sheet" role="dialog" aria-modal="true" aria-label="Plus" onClick={(e) => e.stopPropagation()}>
            <span className="sheet-handle" aria-hidden />
            {sections.map((s) => (
              <div key={s.title} className="more-section">
                <h3>{s.title}</h3>
                <div className="more-grid">
                  {s.items.map((it) => (
                    <Link key={it.href} href={it.href} className={`more-item ${it.highlight ? "highlight" : ""} ${path === it.href ? "active" : ""}`}>
                      <span className="more-icon" aria-hidden>
                        {it.icon}
                      </span>
                      <span>{it.label}</span>
                      {it.badge ? <span className="more-badge">{it.badge}</span> : null}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <div className="more-footer">
              <SoundToggle />
              <form action={logout}>
                <button type="submit" className="btn btn-ghost btn-sm">
                  Se déconnecter
                </button>
              </form>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
