"use client";

import { useEffect, useState } from "react";
import { CardBack, GameCard } from "@/components/GameCard";
import { ELEMENTS, RARITIES, type CardView } from "@/lib/game";

export type GridItem = { card: CardView; count: number };

export function CardGrid({ items }: { items: GridItem[] }) {
  const [open, setOpen] = useState<GridItem | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="grid">
        {items.map((it) =>
          it.count > 0 ? (
            <button key={it.card.id} type="button" className="grid-item" onClick={() => setOpen(it)}>
              <GameCard card={it.card} size="sm" count={it.count} />
            </button>
          ) : (
            <div key={it.card.id} className="grid-item missing" title="Pas encore obtenue">
              <CardBack size="sm" label={`#${String(it.card.number).padStart(3, "0")}`} />
            </div>
          ),
        )}
      </div>
      {open && (
        <div className="modal" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
          <div className="modal-body" onClick={(e) => e.stopPropagation()}>
            <GameCard card={open.card} size="lg" />
            <div className="modal-info">
              <h2>{open.card.name}</h2>
              {open.card.title && <p className="muted">{open.card.title}</p>}
              <p>
                <span className="pill" style={{ background: RARITIES[open.card.rarity].color }}>
                  {RARITIES[open.card.rarity].label}
                </span>{" "}
                <span className="pill" style={{ background: ELEMENTS[open.card.element].color }}>
                  {ELEMENTS[open.card.element].label}
                </span>
              </p>
              {open.card.description && <p className="desc">{open.card.description}</p>}
              <p className="muted">Exemplaires possédés : {open.count}</p>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
