"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { fightArena, pickArena, startArena, stopArena } from "@/app/arene/actions";
import { GameCard } from "@/components/GameCard";
import { DuelReplay } from "@/components/DuelReplay";
import type { DuelLog } from "@/lib/duel";
import { power } from "@/lib/duel";
import type { CardView } from "@/lib/game";
import { play } from "@/lib/sfx";

type Run = { id: string; status: "DRAFT" | "FIGHT"; picks: CardView[]; offer: CardView[]; wins: number; losses: number; lastLog: DuelLog | null; lastNames: [string, string] | null };

export function ArenaGame({
  run,
  freeAvailable,
  entryCost,
  coins,
  maxWins,
  maxLosses,
  rewards,
  lastResult,
  paid = false,
}: {
  run: Run | null;
  freeAvailable: boolean;
  entryCost: number;
  coins: number;
  maxWins: number;
  maxLosses: number;
  rewards: string[];
  lastResult: { wins: number; reward: { coins: number; boosters: number; cardName?: string | null } | null } | null;
  /** Partie payante : pièces seulement */
  paid?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [replay, setReplay] = useState<{ log: DuelLog; names: [string, string] } | null>(null);
  const [team, setTeam] = useState<string[]>([]);

  // Par défaut, les 3 cartes les plus puissantes
  useEffect(() => {
    if (run?.status === "FIGHT") setTeam([...run.picks].sort((a, b) => power(b) - power(a)).slice(0, 3).map((c) => c.id));
  }, [run?.status, run?.picks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = (fn: () => Promise<{ ok: boolean; error?: string; log?: DuelLog; names?: [string, string] }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "Erreur");
      if (res.log && res.names) setReplay({ log: res.log, names: res.names });
      router.refresh();
    });

  const toggle = (id: string) => setTeam((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length < 3 ? [...t, id] : t));
  const pips = (n: number, max: number, cls: string) => Array.from({ length: max }, (_, i) => <span key={i} className={`pip ${cls} ${i < n ? "on" : ""}`} />);

  if (replay)
    return (
      <div className="arena-replay">
        <DuelReplay log={replay.log} names={replay.names} viewerSide={0} rewarded={false} rematchId={null} />
        <div className="exp-go">
          <button type="button" className="btn btn-open" onClick={() => setReplay(null)}>
            {run ? "Continuer →" : "Voir le résultat →"}
          </button>
        </div>
      </div>
    );

  if (!run)
    return (
      <div className="panel arena-start">
        {lastResult && (
          <p className="arena-last">
            Dernière partie : <b>{lastResult.wins} victoire{lastResult.wins > 1 ? "s" : ""}</b>
            {lastResult.reward &&
              ` · 🪙 +${lastResult.reward.coins}${lastResult.reward.boosters ? ` · 🎁 +${lastResult.reward.boosters}` : ""}${lastResult.reward.cardName ? ` · 🃏 ${lastResult.reward.cardName}` : ""}`}
          </p>
        )}
        <button
          type="button"
          className="btn btn-open"
          disabled={pending || (!freeAvailable && coins < entryCost)}
          onClick={() => {
            if (!freeAvailable && !confirm(`Nouvelle partie pour ${entryCost} pièces ?`)) return;
            act(startArena);
            play("flip");
          }}
        >
          {freeAvailable ? "🏟️ Entrer dans l'arène (gratuit)" : `🏟️ Nouvelle partie · 🪙 ${entryCost}`}
        </button>
        {!freeAvailable && <p className="muted small-text">Ta partie gratuite du jour est jouée. Reviens demain, ou rejoue pour {entryCost} pièces.</p>}
        {error && <p className="error">{error}</p>}
      </div>
    );

  return (
    <div className="arena-run">
      <div className="panel arena-score">
        <div>
          <span className="arena-label">Victoires</span>
          <span className="pips">{pips(run.wins, maxWins, "win")}</span>
        </div>
        <div>
          <span className="arena-label">Défaites</span>
          <span className="pips">{pips(run.losses, maxLosses, "loss")}</span>
        </div>
        <div className="arena-now">
          <span className="arena-label">Si tu t&apos;arrêtes</span>
          <b>{rewards[run.wins]}</b>
          {paid && <small className="muted">partie payante : pièces seulement</small>}
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {run.status === "DRAFT" && (
        <>
          <h2 className="exp-step">
            Choix {run.picks.length + 1} / 5 : prends une carte
          </h2>
          <div className="arena-offer">
            {run.offer.map((c) => (
              <button key={c.id} type="button" className="arena-choice" disabled={pending} onClick={() => act(() => pickArena(run.id, c.id))}>
                <GameCard card={c} size="md" />
              </button>
            ))}
          </div>
          {run.picks.length > 0 && (
            <>
              <h3 className="exp-step">Ton équipe d&apos;arène</h3>
              <div className="exp-team">
                {run.picks.map((c) => (
                  <GameCard key={c.id} card={c} size="xs" />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {run.status === "FIGHT" && (
        <>
          <h2 className="exp-step">
            Combat {run.wins + run.losses + 1} : choisis 3 cartes ({team.length}/3)
          </h2>
          <div className="exp-pick">
            {run.picks.map((c) => {
              const pos = team.indexOf(c.id);
              return (
                <button key={c.id} type="button" className={`duel-pick ${pos >= 0 ? "picked" : ""}`} onClick={() => toggle(c.id)}>
                  {pos >= 0 && <span className="pick-pos">{pos + 1}</span>}
                  <GameCard card={c} size="xs" />
                </button>
              );
            })}
          </div>
          <p className="muted small-text">L&apos;ordre compte : ta carte 1 affronte la carte 1 adverse. L&apos;adversaire se renforce à chaque victoire.</p>
          <div className="exp-go row">
            <button type="button" className="btn btn-open" disabled={pending || team.length !== 3} onClick={() => act(() => fightArena(run.id, team))}>
              ⚔ Combattre
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending}
              onClick={() => confirm(`Arrêter et encaisser : ${rewards[run.wins]} ?`) && act(() => stopArena(run.id))}
            >
              Encaisser et arrêter
            </button>
          </div>
        </>
      )}
    </div>
  );
}
