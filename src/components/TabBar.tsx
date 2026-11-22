"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MORE_EVENT } from "@/components/MoreMenu";
import { BoosterStatus } from "@/components/BoosterStatus";

type Props = { trades: number; duels: boolean; more: number; nextAt: number; bonus: number; cooldownMs: number; serverNow: number };

/** Barre d'onglets en bas de l'écran (téléphone et application installée). */
export function TabBar({ trades, duels, more, nextAt, bonus, cooldownMs, serverNow }: Props) {
  const path = usePathname();
  const on = (href: string) => (path === href || path.startsWith(`${href}/`) ? "active" : "");
  return (
    <nav className="tabbar" aria-label="Navigation principale">
      <Link href="/collection" className={`tab ${on("/collection")}`}>
        <span className="tab-icon" aria-hidden>集</span>
        <span>Collection</span>
      </Link>
      <Link href="/echanges" className={`tab ${on("/echanges")}`}>
        <span className="tab-icon" aria-hidden>換</span>
        <span>Échanges</span>
        {trades > 0 && <span className="tab-badge">{trades > 9 ? "9+" : trades}</span>}
      </Link>
      <Link href="/" className={`tab tab-open ${path === "/" ? "active" : ""}`} aria-label="Ouvrir un booster">
        <span className="open-orb" aria-hidden>絆</span>
        <span>Ouvrir</span>
        <BoosterStatus nextAt={nextAt} bonus={bonus} cooldownMs={cooldownMs} serverNow={serverNow} variant="badge" />
      </Link>
      <Link href="/duels" className={`tab ${on("/duels")} ${on("/tournois")}`}>
        <span className="tab-icon" aria-hidden>闘</span>
        <span>Duels</span>
        {duels && <span className="tab-badge dot" aria-label="Tournoi ouvert" />}
      </Link>
      <button type="button" className="tab" onClick={() => window.dispatchEvent(new Event(MORE_EVENT))}>
        <span className="tab-icon" aria-hidden>他</span>
        <span>Plus</span>
        {more > 0 && <span className="tab-badge">{more > 9 ? "9+" : more}</span>}
      </button>
    </nav>
  );
}
