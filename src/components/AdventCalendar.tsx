"use client";

import { useState, useTransition } from "react";
import { openAdventDay, type AdventOpen } from "@/app/avent-actions";
import { GameCard } from "@/components/GameCard";
import { BONUS_EVENT } from "@/components/QuestBoard";
import { play } from "@/lib/sfx";

export type AdventTile = { day: number; state: "opened" | "today" | "missed" | "locked"; label?: string };

export function AdventCalendar({ tiles, grandMin, openedCount, today }: { tiles: AdventTile[]; grandMin: number; openedCount: number; today: number | null }) {
  const [list, setList] = useState(tiles);
  const [result, setResult] = useState<Extract<AdventOpen, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const opened = list.filter((t) => t.state === "opened").length;

  function open() {
    setError(null);
    start(async () => {
      const res = await openAdventDay();
      if (!res.ok) return setError(res.error);
      play(res.card && (res.card.rarity === "LEGENDAIRE" || res.card.shiny) ? "legendary" : "rare");
      setResult(res);
      setList((l) => l.map((t) => (t.day === res.day ? { ...t, state: "opened", label: res.label } : t)));
      if (res.bonus !== undefined) window.dispatchEvent(new CustomEvent(BONUS_EVENT, { detail: res.bonus }));
    });
  }

  return (
    <section className="panel advent" aria-label="Calendrier de l'Avent">
      <div className="advent-head">
        <h2>🎄 Calendrier de l&apos;Avent</h2>
        <span className="muted small-text">
          {opened} case{opened > 1 ? "s" : ""} ouverte{opened > 1 ? "s" : ""}
          {today !== null && today < 24 && ` · grand cadeau du 24 dès ${grandMin} cases (toi : ${Math.max(openedCount, opened)}/${grandMin})`}
        </span>
      </div>
      <div className="advent-grid">
        {list.map((t) => (
          <button
            key={t.day}
            type="button"
            className={`advent-tile ${t.state} ${t.day === 24 ? "big" : ""}`}
            disabled={t.state !== "today" || pending}
            onClick={open}
            title={t.state === "opened" ? t.label : t.state === "missed" ? "Case manquée" : t.state === "today" ? "Ouvrir la case du jour !" : "Pas encore…"}
          >
            <span className="advent-num">{t.day}</span>
            {t.state === "opened" && <span className="advent-label">{t.label}</span>}
            {t.state === "today" && <span className="advent-label">{pending ? "…" : "Ouvrir !"}</span>}
            {t.state === "missed" && <span className="advent-label">❄</span>}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => setResult(null)}>
          <div className="modal-body advent-reveal" onClick={(e) => e.stopPropagation()}>
            <p className="advent-reveal-title">🎁 Case {result.day}</p>
            {result.card && <GameCard card={result.card} size="lg" badge={result.card.isNew ? "NOUVELLE" : undefined} />}
            <h2>{result.label}</h2>
            {result.consolation && (
              <p className="muted">Le grand cadeau était réservé aux membres ayant ouvert au moins {grandMin} cases. Voici un booster pour te consoler !</p>
            )}
            <button type="button" className="btn" onClick={() => setResult(null)}>
              Super !
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
