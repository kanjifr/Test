"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { proposeTrade } from "@/app/echanges/actions";
import { GameCard } from "@/components/GameCard";
import type { CardView } from "@/lib/game";

export type Tradable = { card: CardView; available: number };
type Picks = Record<string, number>;

function Side({
  title,
  empty,
  items,
  picks,
  setPicks,
}: {
  title: string;
  empty: string;
  items: Tradable[];
  picks: Picks;
  setPicks: (p: Picks) => void;
}) {
  const change = (id: string, delta: number, max: number) => {
    const next = Math.max(0, Math.min(max, (picks[id] ?? 0) + delta));
    const copy = { ...picks };
    if (next === 0) delete copy[id];
    else copy[id] = next;
    setPicks(copy);
  };
  const total = Object.values(picks).reduce((a, b) => a + b, 0);
  return (
    <div className="panel trade-side">
      <h2>
        {title} <span className="muted">({total})</span>
      </h2>
      {items.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="trade-pick-grid">
          {items.map(({ card, available }) => {
            const n = picks[card.id] ?? 0;
            return (
              <div key={card.id} className={`trade-pick ${n > 0 ? "picked" : ""}`}>
                <button type="button" className="trade-pick-card" onClick={() => change(card.id, n > 0 ? -n : 1, available)}>
                  <GameCard card={card} size="xs" />
                </button>
                <div className="stepper">
                  <button type="button" onClick={() => change(card.id, -1, available)} disabled={n === 0} aria-label="Retirer">
                    −
                  </button>
                  <span>
                    {n}/{available}
                  </span>
                  <button type="button" onClick={() => change(card.id, 1, available)} disabled={n >= available} aria-label="Ajouter">
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TradeBuilder({
  toId,
  toName,
  mine,
  theirs,
  parentId,
  initialOffer = {},
  initialRequest = {},
}: {
  toId: string;
  toName: string;
  mine: Tradable[];
  theirs: Tradable[];
  parentId?: string;
  initialOffer?: Picks;
  initialRequest?: Picks;
}) {
  const router = useRouter();
  const [offer, setOffer] = useState<Picks>(initialOffer);
  const [request, setRequest] = useState<Picks>(initialRequest);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toLines = (p: Picks) => Object.entries(p).map(([cardId, qty]) => ({ cardId, qty }));
  const canSend = Object.keys(offer).length > 0 && Object.keys(request).length > 0;

  function submit() {
    setError(null);
    start(async () => {
      const res = await proposeTrade({ toId, offer: toLines(offer), request: toLines(request), parentId });
      if (res.ok) router.push("/echanges?sent=1");
      else setError(res.error);
    });
  }

  return (
    <div className="trade-builder">
      <div className="trade-cols">
        <Side
          title="Tu donnes"
          empty="Tu n'as pas encore de doublons à échanger. Ouvre des boosters !"
          items={mine}
          picks={offer}
          setPicks={setOffer}
        />
        <div className="trade-arrows" aria-hidden>
          ⇄
        </div>
        <Side
          title={`Tu reçois de ${toName}`}
          empty={`${toName} n'a pas de doublons à échanger pour le moment.`}
          items={theirs}
          picks={request}
          setPicks={setRequest}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="deal-actions">
        <button type="button" className="btn" disabled={!canSend || pending} onClick={submit}>
          {pending ? "Envoi…" : parentId ? "Envoyer la contre-proposition" : "Envoyer la proposition"}
        </button>
      </div>
      <p className="muted center">
        Seuls les doublons sont échangeables : chacun garde toujours au moins un exemplaire. La proposition expire au bout de 48 h.
      </p>
    </div>
  );
}
