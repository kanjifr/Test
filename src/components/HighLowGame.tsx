"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { guessHighLow, startHighLow, type HLState } from "@/app/plus-ou-moins/actions";
import { CardBack, GameCard } from "@/components/GameCard";
import type { CardView } from "@/lib/game";
import { play } from "@/lib/sfx";
import { HL_COINS_MAX, HL_COINS_PER } from "@/lib/highlow";

type Reveal = { card: CardView; correct: boolean };

export function HighLowGame({ record, rewardedDone }: { record: number; rewardedDone: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<HLState | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [end, setEnd] = useState<{ streak: number; coins: number; booster: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function begin() {
    setError(null);
    setEnd(null);
    setReveal(null);
    start(async () => {
      const res = await startHighLow();
      if (!res.ok) return setError(res.error);
      setState(res.state);
      play("flip");
    });
  }

  function guess(dir: "up" | "down") {
    if (!state || reveal) return;
    start(async () => {
      const res = await guessHighLow(state.id, dir);
      if (!res.ok) return setError(res.error);
      setReveal({ card: res.next, correct: res.correct });
      play(res.correct ? "rare" : "lose");
      // La carte révélée reste affichée un instant, puis devient la carte du dessus
      setTimeout(() => {
        setReveal(null);
        if (res.done) {
          setEnd({ streak: res.streak, coins: res.coins, booster: res.booster });
          setState(null);
          router.refresh();
        } else setState({ ...state, current: res.next, streak: res.streak });
      }, res.correct ? 900 : 1400);
    });
  }

  if (!state)
    return (
      <div className="panel hl-start">
        {end && (
          <div className="hl-end">
            <p className="hl-end-title">{end.streak >= record && end.streak > 0 ? "🏆 Nouveau record !" : "Partie terminée"}</p>
            <p>
              Série de <b>{end.streak}</b>
              {end.coins > 0 && ` · 🪙 +${end.coins}`}
              {end.booster && " · 🎁 +1 booster"}
            </p>
          </div>
        )}
        <p className="muted small-text">Ton record : {Math.max(record, end?.streak ?? 0)}</p>
        <button type="button" className="btn btn-open" disabled={pending} onClick={begin}>
          {end ? "Rejouer" : "Jouer"}
        </button>
        <p className="muted small-text">{rewardedDone || end ? "Partie du jour déjà récompensée : celle-ci compte pour le classement." : "Ta première partie du jour rapporte des pièces !"}</p>
        {error && <p className="error">{error}</p>}
      </div>
    );

  return (
    <div className="panel hl-board">
      <div className="hl-streak">
        Série : <b>{state.streak}</b>
        {state.rewarded && <span className="muted small-text"> · 🪙 {Math.min(HL_COINS_MAX, state.streak * HL_COINS_PER)} en jeu</span>}
      </div>
      <div className="hl-cards">
        <div className="hl-slot">
          <GameCard card={state.current} size="md" />
          <span className="hl-atk">ATK {state.current.attack}</span>
        </div>
        <span className="hl-vs" aria-hidden>
          ?
        </span>
        <div className={`hl-slot ${reveal ? (reveal.correct ? "good" : "bad") : ""}`}>
          {reveal ? (
            <>
              <GameCard card={reveal.card} size="md" />
              <span className="hl-atk">ATK {reveal.card.attack}</span>
            </>
          ) : (
            <CardBack size="md" />
          )}
        </div>
      </div>
      <div className="hl-buttons">
        <button type="button" className="btn btn-open hl-up" disabled={pending || !!reveal} onClick={() => guess("up")}>
          ▲ Plus
        </button>
        <button type="button" className="btn btn-open hl-down" disabled={pending || !!reveal} onClick={() => guess("down")}>
          ▼ Moins
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
