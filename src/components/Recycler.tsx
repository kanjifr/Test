"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { recycleDuplicates } from "@/app/recyclage/actions";
import { GameCard } from "@/components/GameCard";
import { RARITIES, RARITY_ORDER, type CardView } from "@/lib/game";

export type Duplicate = { card: CardView; extra: number };

const PRECIOUS = new Set(["EPIQUE", "LEGENDAIRE", "MYTHIQUE"]);

export function Recycler({ items, cost, initialBonus }: { items: Duplicate[]; cost: number; initialBonus: number }) {
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [bonus, setBonus] = useState(initialBonus);
  const [list, setList] = useState(items);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const total = Object.values(picks).reduce((a, b) => a + b, 0);
  const available = list.reduce((a, d) => a + d.extra, 0);
  const boosters = Math.floor(total / cost);
  const valid = total > 0 && total % cost === 0;
  const precious = list.filter((d) => picks[d.card.id] && PRECIOUS.has(d.card.rarity));

  const change = (id: string, delta: number, max: number) =>
    setPicks((p) => {
      const n = Math.max(0, Math.min(max, (p[id] ?? 0) + delta));
      const next = { ...p };
      if (n) next[id] = n;
      else delete next[id];
      return next;
    });

  // Sélection automatique : les doublons les plus communs d'abord, jusqu'au plus grand multiple possible
  function autoPick() {
    const target = Math.floor(available / cost) * cost;
    const sorted = [...list].sort(
      (a, b) => RARITY_ORDER.indexOf(a.card.rarity) - RARITY_ORDER.indexOf(b.card.rarity) || b.extra - a.extra,
    );
    const next: Record<string, number> = {};
    let left = target;
    for (const d of sorted) {
      if (left <= 0) break;
      const n = Math.min(d.extra, left);
      next[d.card.id] = n;
      left -= n;
    }
    setPicks(next);
  }

  const grouped = useMemo(
    () => [...list].sort((a, b) => RARITY_ORDER.indexOf(a.card.rarity) - RARITY_ORDER.indexOf(b.card.rarity) || a.card.number - b.card.number),
    [list],
  );

  function recycle() {
    if (precious.length && !confirm(`Tu vas recycler des cartes rares (${precious.map((d) => d.card.name).join(", ")}). Continuer ?`)) return;
    setMsg(null);
    start(async () => {
      const res = await recycleDuplicates(Object.entries(picks).map(([cardId, qty]) => ({ cardId, qty })));
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      setBonus(res.bonus);
      setList((l) => l.map((d) => ({ ...d, extra: d.extra - (picks[d.card.id] ?? 0) })).filter((d) => d.extra > 0));
      setPicks({});
      setMsg({ ok: true, text: `♻ ${total} doublons recyclés : +${res.boosters} booster${res.boosters > 1 ? "s" : ""} bonus !` });
    });
  }

  return (
    <div className="recycler">
      <div className="panel recycle-bar">
        <div>
          <p className="recycle-count">
            <b>{total}</b> doublon{total > 1 ? "s" : ""} sélectionné{total > 1 ? "s" : ""}
            <span className="muted"> · {cost} = 1 booster</span>
          </p>
          <div className="recycle-progress">
            <span style={{ width: `${Math.min(100, ((total % cost || (total ? cost : 0)) / cost) * 100)}%` }} />
          </div>
          <p className="muted small-text">
            {valid
              ? `→ ${boosters} booster${boosters > 1 ? "s" : ""} bonus`
              : total
                ? `Encore ${cost - (total % cost)} pour ${boosters + 1} booster${boosters + 1 > 1 ? "s" : ""}`
                : `Tu as ${available} doublon${available > 1 ? "s" : ""} recyclable${available > 1 ? "s" : ""}.`}
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={autoPick} disabled={available < cost || pending}>
            Sélection automatique
          </button>
          {total > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicks({})} disabled={pending}>
              Tout désélectionner
            </button>
          )}
          <button type="button" className="btn" onClick={recycle} disabled={!valid || pending}>
            {pending ? "Recyclage…" : `♻ Recycler${valid ? ` → ${boosters} booster${boosters > 1 ? "s" : ""}` : ""}`}
          </button>
        </div>
      </div>

      {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
      {bonus > 0 && (
        <p className="bonus-banner">
          🎁 Tu as <b>{bonus}</b> booster{bonus > 1 ? "s" : ""} bonus à ouvrir.{" "}
          <Link href="/">Les ouvrir maintenant →</Link>
        </p>
      )}
      {precious.length > 0 && (
        <p className="last-copy">⚠ Ta sélection contient des cartes Épiques ou plus rares : vérifie avant de recycler.</p>
      )}

      {grouped.length === 0 ? (
        <p className="muted">
          Aucun doublon pour le moment. Les cartes en un seul exemplaire ne peuvent pas être recyclées.
        </p>
      ) : (
        <div className="trade-pick-grid recycle-grid">
          {grouped.map(({ card, extra }) => {
            const n = picks[card.id] ?? 0;
            return (
              <div key={card.id} className={`trade-pick ${n ? "picked" : ""}`}>
                <button type="button" className="trade-pick-card" onClick={() => change(card.id, n ? -n : extra, extra)}>
                  <GameCard card={card} size="xs" count={extra + 1} />
                </button>
                <div className="stepper">
                  <button type="button" onClick={() => change(card.id, -1, extra)} disabled={!n} aria-label="Retirer">
                    −
                  </button>
                  <span>
                    {n}/{extra}
                  </span>
                  <button type="button" onClick={() => change(card.id, 1, extra)} disabled={n >= extra} aria-label="Ajouter">
                    +
                  </button>
                </div>
                <span className="muted small-text" style={{ color: RARITIES[card.rarity].color }}>
                  {RARITIES[card.rarity].label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
