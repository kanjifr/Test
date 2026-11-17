"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { markAchievementsSeen } from "@/app/actions";
import { TIERS, type BadgeView } from "@/lib/achievements";
import { Badge } from "@/components/Badge";

const HOLD_EVENT = "achievement-hold";
let held = false;

/** Met les notifications en pause (ex. pendant la révélation d'un booster). */
export function holdAchievementToasts(value: boolean) {
  held = value;
  window.dispatchEvent(new Event(HOLD_EVENT));
}

export function AchievementToasts({ items }: { items: BadgeView[] }) {
  const [queue, setQueue] = useState<BadgeView[]>([]);
  const [shown, setShown] = useState<BadgeView[]>([]);
  const [isHeld, setHeld] = useState(held);
  const key = items.map((i) => i.id).join(",");

  useEffect(() => {
    const onHold = () => setHeld(held);
    window.addEventListener(HOLD_EVENT, onHold);
    return () => window.removeEventListener(HOLD_EVENT, onHold);
  }, []);

  useEffect(() => {
    if (!items.length) return;
    setQueue((q) => [...q, ...items.filter((i) => !q.some((p) => p.id === i.id))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Affiche la file d'attente dès que la pause est levée
  useEffect(() => {
    if (isHeld || !queue.length) return;
    const fresh = queue.filter((q) => !shown.some((s) => s.id === q.id));
    setQueue([]);
    if (!fresh.length) return;
    setShown((s) => [...s, ...fresh]);
    void markAchievementsSeen(fresh.map((i) => i.id));
  }, [isHeld, queue, shown]);

  useEffect(() => {
    if (!shown.length) return;
    const t = setTimeout(() => setShown((s) => s.slice(1)), 6000);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {shown.slice(0, 3).map((b) => (
        <div key={b.id} className="toast" style={{ "--tc": TIERS[b.tier].color } as React.CSSProperties}>
          <Badge badge={b} size="lg" />
          <div>
            <p className="toast-title">Succès débloqué · {TIERS[b.tier].label}</p>
            <p className="toast-name">{b.name}</p>
            <p className="toast-desc">{b.description}</p>
            <Link href="/profil#succes" className="toast-link">
              Voir mes succès
            </Link>
          </div>
          <button type="button" className="toast-close" onClick={() => setShown((s) => s.filter((x) => x.id !== b.id))} aria-label="Fermer">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
