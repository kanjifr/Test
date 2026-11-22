"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Mise à jour envoyée par le PackOpener après l'ouverture d'un booster. */
export const PACK_EVENT = "kizuna:pack";

const left = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
};

/** Anneau qui se remplit jusqu'au prochain booster, avec le nombre de boosters disponibles. */
export function BoosterStatus({
  nextAt: initialNext,
  bonus: initialBonus,
  cooldownMs,
  serverNow,
  variant = "chip",
}: {
  nextAt: number;
  bonus: number;
  cooldownMs: number;
  /** Heure du serveur au rendu : le premier affichage est identique côté serveur et navigateur */
  serverNow: number;
  variant?: "chip" | "badge";
}) {
  const [nextAt, setNextAt] = useState(initialNext);
  const [bonus, setBonus] = useState(initialBonus);
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 20_000);
    const onBonus = (e: Event) => setBonus(Number((e as CustomEvent).detail) || 0);
    const onPack = (e: Event) => {
      const d = (e as CustomEvent<{ nextAt: number; bonus: number }>).detail;
      setNextAt(d.nextAt);
      setBonus(d.bonus);
      setNow(Date.now());
    };
    window.addEventListener("kizuna:bonus", onBonus);
    window.addEventListener(PACK_EVENT, onPack);
    return () => {
      clearInterval(t);
      window.removeEventListener("kizuna:bonus", onBonus);
      window.removeEventListener(PACK_EVENT, onPack);
    };
  }, []);
  const ready = now >= nextAt;
  const count = (ready ? 1 : 0) + bonus;
  const progress = ready || cooldownMs <= 0 ? 1 : Math.min(1, Math.max(0, 1 - (nextAt - now) / cooldownMs));
  const title = count > 0 ? `${count} booster${count > 1 ? "s" : ""} à ouvrir` : `Prochain booster dans ${left(nextAt - now)}`;

  if (variant === "badge") return count > 0 ? <span className="tab-badge">{count > 9 ? "9+" : count}</span> : null;
  return (
    <Link href="/" className={`booster-status ${count > 0 ? "ready" : ""}`} title={title} aria-label={title}>
      <span className="ring" style={{ "--p": progress } as React.CSSProperties}>
        <b>{count}</b>
      </span>
      {!ready && count === 0 && <span className="booster-left">{left(nextAt - now)}</span>}
    </Link>
  );
}
