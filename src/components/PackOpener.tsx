"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { openPack, type OpenResult } from "@/app/actions";
import { CardBack, GameCard } from "@/components/GameCard";
import { RARITIES } from "@/lib/game";

type Pulled = Extract<OpenResult, { ok: true }>["cards"][number];
type Phase = "idle" | "tearing" | "dealt";

function formatLeft(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h > 0 ? `${h}h ` : ""}${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

export function PackOpener({
  initialNextAt,
  serverNow,
  siteName,
  packSize,
}: {
  initialNextAt: number;
  serverNow: number;
  siteName: string;
  packSize: number;
}) {
  const [nextAt, setNextAt] = useState(initialNextAt);
  const [now, setNow] = useState(serverNow);
  const [phase, setPhase] = useState<Phase>("idle");
  const [cards, setCards] = useState<Pulled[]>([]);
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ready = now >= nextAt;
  const allFlipped = flipped.length > 0 && flipped.every(Boolean);

  function open() {
    setError(null);
    startTransition(async () => {
      const res = await openPack();
      if (!res.ok) {
        setError(res.error);
        if (res.nextAt) setNextAt(res.nextAt);
        return;
      }
      setNextAt(res.nextAt);
      setCards(res.cards);
      setFlipped(res.cards.map(() => false));
      setPhase("tearing");
      setTimeout(() => setPhase("dealt"), 1300);
    });
  }

  function flip(i: number) {
    if (flipped[i]) return;
    setFlipped((f) => f.map((v, j) => (j === i ? true : v)));
    const r = cards[i].rarity;
    if (r === "LEGENDAIRE" || r === "EPIQUE") {
      setFlash(RARITIES[r].color);
      setTimeout(() => setFlash(null), 900);
    }
  }

  function flipAll() {
    cards.forEach((_, i) => setTimeout(() => flip(i), i * 250));
  }

  function reset() {
    setPhase("idle");
    setCards([]);
    setFlipped([]);
  }

  return (
    <div className="opener">
      {flash && <div className="flash" style={{ "--fc": flash } as React.CSSProperties} />}

      {phase !== "dealt" && (
        <div className="pack-stage">
          <button
            type="button"
            className={`pack ${phase === "tearing" ? "tearing" : ""} ${pending ? "shaking" : ""} ${
              ready ? "ready" : "locked"
            }`}
            onClick={open}
            disabled={!ready || pending || phase !== "idle"}
            aria-label="Ouvrir le booster"
          >
            <span className="pack-top" />
            <span className="pack-body">
              <span className="pack-kanji">絆</span>
              <span className="pack-name">{siteName}</span>
              <span className="pack-sub">Booster · {packSize} cartes</span>
            </span>
          </button>
          <div className="pack-caption">
            {ready ? (
              <span className="cta">{pending ? "Ouverture…" : "Clique sur le booster pour l'ouvrir"}</span>
            ) : (
              <span>
                Prochain booster dans <b className="timer">{formatLeft(nextAt - now)}</b>
              </span>
            )}
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}

      {phase === "dealt" && (
        <>
          <div className="deal">
            {cards.map((c, i) => (
              <button
                type="button"
                key={i}
                className={`flipper ${flipped[i] ? "is-flipped" : ""} glow-${c.rarity.toLowerCase()}`}
                style={{ animationDelay: `${i * 120}ms` }}
                onClick={() => flip(i)}
                aria-label={flipped[i] ? c.name : "Retourner la carte"}
              >
                <span className="flipper-inner">
                  <span className="face face-back">
                    <CardBack />
                  </span>
                  <span className="face face-front">
                    <GameCard card={c} badge={c.isNew ? "NOUVEAU" : undefined} />
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="deal-actions">
            {!allFlipped ? (
              <button type="button" className="btn" onClick={flipAll}>
                Tout retourner
              </button>
            ) : (
              <>
                <Link href="/collection" className="btn">
                  Voir ma collection
                </Link>
                <button type="button" className="btn btn-ghost" onClick={reset}>
                  {ready ? "Ouvrir un autre booster" : `Prochain booster : ${formatLeft(nextAt - now)}`}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
