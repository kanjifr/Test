"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GameCard } from "@/components/GameCard";
import type { DuelLog, Hit } from "@/lib/duel";
import type { CardView } from "@/lib/game";
import { play } from "@/lib/sfx";

type Step = { round: number; hit: number }; // hit = -1 : présentation de la manche, hits.length : fin de manche

const HIT_MS = 850;
const INTRO_MS = 1300;
const END_MS = 1700;

function HpBar({ hp, max }: { hp: number; max: number }) {
  const pct = Math.max(0, Math.round((hp / max) * 100));
  return (
    <div className="hp">
      <div className={`hp-fill ${pct < 30 ? "low" : pct < 60 ? "mid" : ""}`} style={{ width: `${pct}%` }} />
      <span>
        {hp} / {max} PV
      </span>
    </div>
  );
}

function hitLabel(h: Hit) {
  if (h.dodge) return "Esquive !";
  const parts = [`-${h.dmg}`];
  if (h.crit) parts.push("Critique !");
  if (h.effect === "super") parts.push("Super efficace !");
  if (h.effect === "weak") parts.push("Peu efficace…");
  return parts.join(" ");
}

export function DuelReplay({
  log,
  names,
  viewerSide,
  rewarded,
  ratingDelta = null,
  rematchId,
}: {
  log: DuelLog;
  names: [string, string];
  /** 0 = attaquant, 1 = défenseur, null = spectateur */
  viewerSide: 0 | 1 | null;
  rewarded: boolean;
  /** Points de cote gagnés ou perdus par le spectateur (s'il a participé) */
  ratingDelta?: number | null;
  rematchId: string | null;
}) {
  const [step, setStep] = useState<Step>({ round: 0, hit: -1 });
  const [done, setDone] = useState(false);
  const round = log.rounds[step.round];

  // Bruitages : chaque coup, puis la fin du duel
  useEffect(() => {
    const h = round && step.hit >= 0 && step.hit < round.hits.length ? round.hits[step.hit] : null;
    if (h) play(h.dodge ? "dodge" : h.crit ? "crit" : "hit");
  }, [step, round]);
  useEffect(() => {
    if (!done) return;
    if (log.winner === -1 || viewerSide === null) play("rare");
    else play(log.winner === viewerSide ? "win" : "lose");
  }, [done, log.winner, viewerSide]);

  useEffect(() => {
    if (done || !round) return;
    const delay = step.hit === -1 ? INTRO_MS : step.hit >= round.hits.length ? END_MS : HIT_MS;
    const t = setTimeout(() => {
      if (step.hit < round.hits.length) setStep({ round: step.round, hit: step.hit + 1 });
      else if (step.round + 1 < log.rounds.length) setStep({ round: step.round + 1, hit: -1 });
      else setDone(true);
    }, delay);
    return () => clearTimeout(t);
  }, [step, done, round, log.rounds.length]);

  const score: [number, number] = [0, 0];
  log.rounds.slice(0, done ? log.rounds.length : step.round).forEach((r) => r.winner !== -1 && score[r.winner]++);
  if (!done && round && step.hit >= round.hits.length && round.winner !== -1) score[round.winner]++;

  if (done) {
    const outcome =
      log.winner === -1 ? "draw" : viewerSide === null ? "neutral" : log.winner === viewerSide ? "win" : "loss";
    const title =
      outcome === "draw" ? "Match nul" : outcome === "win" ? "Victoire !" : outcome === "loss" ? "Défaite" : `${names[log.winner as 0 | 1]} l'emporte`;
    return (
      <div className={`duel-final ${outcome}`}>
        <p className="duel-final-title">{title}</p>
        <p className="duel-score">
          {names[0]} <b>{log.score[0]}</b> – <b>{log.score[1]}</b> {names[1]}
        </p>
        {ratingDelta !== null && (
          <p className={`rating-delta ${ratingDelta >= 0 ? "up" : "down"}`}>
            {ratingDelta >= 0 ? "▲ +" : "▼ "}
            {ratingDelta} point{Math.abs(ratingDelta) > 1 ? "s" : ""} de cote
          </p>
        )}
        {rewarded && viewerSide === 0 && <p className="bonus-banner">🎁 Première victoire du jour : +1 booster bonus !</p>}
        <ol className="round-summary">
          {log.rounds.map((r, i) => (
            <li key={i}>
              <span className="muted">Manche {i + 1}</span>
              <span className={r.winner === 0 ? "won" : ""}>{r.fighters[0].name}</span>
              <span className="muted">vs</span>
              <span className={r.winner === 1 ? "won" : ""}>{r.fighters[1].name}</span>
              <span className="muted">{r.winner === -1 ? "égalité" : `→ ${names[r.winner]}`}</span>
            </li>
          ))}
        </ol>
        <div className="deal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => { setDone(false); setStep({ round: 0, hit: -1 }); }}>
            ↺ Revoir le combat
          </button>
          <Link href={rematchId ? `/duels?adversaire=${rematchId}` : "/duels"} className="btn">
            {rematchId ? "⚔ Revanche" : "Retour aux duels"}
          </Link>
        </div>
      </div>
    );
  }

  const hit = step.hit >= 0 && step.hit < round.hits.length ? round.hits[step.hit] : null;
  const hp: [number, number] = hit ? hit.hp : step.hit >= round.hits.length ? round.hits.at(-1)?.hp ?? round.hpMax : round.hpMax;
  const ended = step.hit >= round.hits.length;

  return (
    <div className="arena">
      <div className="arena-top">
        <span className="arena-name">{names[0]}</span>
        <span className="arena-score">
          {score[0]} – {score[1]}
        </span>
        <span className="arena-name">{names[1]}</span>
      </div>
      <p className="arena-round">
        Manche {step.round + 1} / {log.rounds.length}
      </p>
      <div className="arena-field">
        {[0, 1].map((side) => {
          const f = round.fighters[side] as CardView;
          const attacking = hit?.from === side;
          const hitHere = hit && hit.from !== side;
          const ko = ended && round.winner !== -1 && round.winner !== side;
          return (
            <div key={`${step.round}-${side}`} className={`fighter side-${side} ${attacking ? "attacking" : ""} ${hitHere && !hit.dodge ? "hurt" : ""} ${ko ? "ko" : ""}`}>
              <HpBar hp={hp[side]} max={round.hpMax[side]} />
              <div className="fighter-card">
                <GameCard card={f} size="md" />
                {hitHere && (
                  <span key={step.hit} className={`dmg ${hit.crit ? "crit" : ""} ${hit.effect} ${hit.dodge ? "dodge" : ""}`}>
                    {hitLabel(hit)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <span className="versus">VS</span>
      </div>
      <p className="arena-caption">
        {step.hit === -1
          ? `${round.fighters[round.first].name} frappe en premier !`
          : ended
            ? round.winner === -1
              ? "Égalité !"
              : `${round.fighters[round.winner].name} remporte la manche !`
            : `${round.fighters[hit!.from].name} attaque…`}
      </p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDone(true)}>
        Passer ⏭
      </button>
    </div>
  );
}
