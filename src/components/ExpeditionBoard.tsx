"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { claimExpedition, recallExpedition, startExpedition, type ClaimView } from "@/app/expeditions/actions";
import { GameCard } from "@/components/GameCard";
import { ELEMENTS, type CardView } from "@/lib/game";
import { EXPEDITION_TEAM, teamFactor, type Destination, type Duration } from "@/lib/expeditions";
import { play } from "@/lib/sfx";

export type ActiveExp = { id: string; destination: Destination; hours: number; startedAt: number; endsAt: number; cards: CardView[] };

const left = (ms: number) => {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
};

export function ExpeditionBoard({ destinations, durations, cards, active, serverNow }: { destinations: Destination[]; durations: Duration[]; cards: CardView[]; active: ActiveExp[]; serverNow: number }) {
  const router = useRouter();
  const [now, setNow] = useState(serverNow);
  const [dest, setDest] = useState(destinations[0]?.id ?? "");
  const [hours, setHours] = useState(durations[1]?.hours ?? 8);
  const [team, setTeam] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loot, setLoot] = useState<Extract<ClaimView, { ok: true }> | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const d = destinations.find((x) => x.id === dest) ?? destinations[0];
  const duration = durations.find((x) => x.hours === hours) ?? durations[0];
  const picked = team.map((id) => cards.find((c) => c.id === id)).filter((c): c is CardView => !!c);
  const factor = picked.length ? teamFactor(picked, d) : 1;
  // Les cartes du bon élément d'abord
  const sorted = [...cards].sort((a, b) => Number(d.elements.includes(b.element)) - Number(d.elements.includes(a.element)) || (b.level ?? 1) - (a.level ?? 1));
  const toggle = (id: string) => setTeam((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length < EXPEDITION_TEAM ? [...t, id] : t));

  function go() {
    setError(null);
    start(async () => {
      const res = await startExpedition({ destination: d.id, hours, cardIds: team });
      if (!res.ok) return setError(res.error);
      play("flip");
      setTeam([]);
      router.refresh();
    });
  }
  function claim(id: string) {
    start(async () => {
      const res = await claimExpedition(id);
      if (!res.ok) return setError(res.error);
      play(res.card ? "epic" : "rare");
      setLoot(res);
      router.refresh();
    });
  }
  function recall(id: string) {
    if (!confirm("Rappeler tes cartes maintenant ? Elles reviennent sans rien.")) return;
    start(async () => {
      const res = await recallExpedition(id);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="exp-board">
      {error && <p className="error">{error}</p>}

      {active.map((e) => {
        const done = now >= e.endsAt;
        const pct = Math.min(100, Math.max(0, ((now - e.startedAt) / (e.endsAt - e.startedAt)) * 100));
        return (
          <section key={e.id} className={`panel exp-active ${done ? "done" : ""}`}>
            <div className="exp-active-head">
              <span className="exp-kanji big" aria-hidden>
                {e.destination.kanji}
              </span>
              <div>
                <h2>{e.destination.name}</h2>
                <p className="muted small-text">
                  Voyage de {e.hours} h · {done ? "tes cartes sont de retour !" : `retour dans ${left(e.endsAt - now)}`}
                </p>
              </div>
            </div>
            <div className="exp-road" role="img" aria-label={`${Math.round(pct)} % du voyage`}>
              <span style={{ width: `${pct}%` }} />
              <i style={{ left: `${pct}%` }} aria-hidden>
                ➤
              </i>
            </div>
            <div className="exp-team">
              {e.cards.map((c) => (
                <GameCard key={c.id} card={c} size="xs" />
              ))}
            </div>
            <div className="row">
              {done ? (
                <button type="button" className="btn" disabled={pending} onClick={() => claim(e.id)}>
                  🎁 Ouvrir le butin
                </button>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => recall(e.id)}>
                  Rappeler (sans butin)
                </button>
              )}
            </div>
          </section>
        );
      })}

      {active.length === 0 && (
        <>
          <h2 className="exp-step">1. Destination du jour</h2>
          <div className="exp-dests">
            {destinations.map((x) => (
              <button key={x.id} type="button" className={`exp-dest ${x.id === d.id ? "on" : ""}`} onClick={() => setDest(x.id)}>
                <span className="exp-kanji big" aria-hidden>
                  {x.kanji}
                </span>
                <b>{x.name}</b>
                <small className="muted">{x.description}</small>
                <span className="exp-els">
                  {x.elements.map((el) => (
                    <span key={el} className="pill" style={{ background: ELEMENTS[el].color }}>
                      {ELEMENTS[el].kanji} {ELEMENTS[el].label}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>

          <h2 className="exp-step">2. Durée</h2>
          <div className="exp-durations">
            {durations.map((x) => (
              <button key={x.hours} type="button" className={`exp-duration ${x.hours === hours ? "on" : ""}`} onClick={() => setHours(x.hours)}>
                <b>{x.hours} h</b>
                <small>
                  🪙 ~{Math.round(x.coins * factor)} · 🃏 {Math.round(Math.min(0.9, x.cardChance * factor) * 100)} % · 🎁 {Math.round(x.boosterChance * factor * 100)} %
                </small>
              </button>
            ))}
          </div>

          <h2 className="exp-step">
            3. Ton équipe ({picked.length}/{EXPEDITION_TEAM}){" "}
            {picked.length > 0 && <span className="exp-factor">bonus ×{factor.toLocaleString("fr-FR")}</span>}
          </h2>
          {cards.length < EXPEDITION_TEAM ? (
            <p className="muted">Il te faut au moins {EXPEDITION_TEAM} cartes. Ouvre des boosters !</p>
          ) : (
            <div className="exp-pick">
              {sorted.map((c) => {
                const pos = team.indexOf(c.id);
                const match = d.elements.includes(c.element);
                return (
                  <button key={c.id} type="button" className={`duel-pick ${pos >= 0 ? "picked" : ""} ${match ? "match" : ""}`} onClick={() => toggle(c.id)}>
                    {pos >= 0 && <span className="pick-pos">{pos + 1}</span>}
                    <GameCard card={c} size="xs" />
                    {match && <span className="exp-match">✓ {ELEMENTS[c.element].label}</span>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="exp-go">
            <button type="button" className="btn btn-open" disabled={pending || picked.length !== EXPEDITION_TEAM} onClick={go}>
              🧭 Partir {duration.hours} h
            </button>
          </div>
        </>
      )}

      {loot && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => setLoot(null)}>
          <div className="modal-body advent-reveal" onClick={(e) => e.stopPropagation()}>
            <p className="advent-reveal-title">🧭 Retour de {loot.destination}</p>
            {loot.card && <GameCard card={loot.card} size="lg" badge={loot.card.isNew ? "NOUVEAU" : undefined} />}
            <h2>
              🪙 +{loot.coins} pièces
              {loot.booster && " · 🎁 +1 booster"}
            </h2>
            {!loot.card && !loot.booster && <p className="muted">Pas de carte cette fois. Tente une expédition plus longue !</p>}
            <button type="button" className="btn" onClick={() => setLoot(null)}>
              Super !
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
