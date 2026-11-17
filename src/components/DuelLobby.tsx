"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { saveDefenseTeam, startDuel } from "@/app/duels/actions";
import { GameCard } from "@/components/GameCard";
import { NameWithBadge } from "@/components/Badge";
import { ELEMENTS, type CardView } from "@/lib/game";
import type { BadgeView } from "@/lib/achievements";

export type Opponent = { id: string; name: string | null; image: string | null; wins: number; losses: number; badge: BadgeView | null; foughtToday: number };

const KEY = "kizuna.duel.team";

export function DuelLobby({
  cards,
  defense,
  opponents,
  teamSize,
  duelsLeft,
  sameOpponentLimit,
  rewardAvailable,
  highlight,
}: {
  cards: CardView[];
  defense: string[];
  opponents: Opponent[];
  teamSize: number;
  duelsLeft: number;
  sameOpponentLimit: number;
  rewardAvailable: boolean;
  /** Adversaire à mettre en avant (revanche) */
  highlight: string | null;
}) {
  const router = useRouter();
  const [team, setTeam] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [defenseIds, setDefenseIds] = useState(defense);
  const [pending, start] = useTransition();
  const byId = new Map(cards.map((c) => [c.id, c]));

  // On retrouve la dernière équipe utilisée
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(saved)) setTeam(saved.filter((id: string) => cards.some((c) => c.id === id)).slice(0, teamSize));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const update = (next: string[]) => {
    setTeam(next);
    setMsg(null);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };
  const toggle = (id: string) =>
    update(team.includes(id) ? team.filter((t) => t !== id) : team.length < teamSize ? [...team, id] : team);

  const ready = team.length === teamSize;

  function fight(opponent: string) {
    setMsg(null);
    start(async () => {
      const res = await startDuel({ opponent, team });
      if (res.ok) router.push(`/duels/${res.id}`);
      else setMsg({ ok: false, text: res.error });
    });
  }

  function saveDefense() {
    start(async () => {
      const res = await saveDefenseTeam(team);
      if (res.ok) {
        setDefenseIds(team);
        setMsg({ ok: true, text: "🛡 Équipe de défense enregistrée : c'est elle qui combattra quand on te défiera." });
      } else setMsg({ ok: false, text: res.error ?? "Erreur" });
    });
  }

  return (
    <div className="lobby">
      <div className="panel lobby-team">
        <div className="lobby-head">
          <h2>Ton équipe</h2>
          <p className="muted small-text">
            Choisis {teamSize} cartes dans l&apos;ordre : ta carte 1 affronte la carte 1 adverse, etc. L&apos;équipe adverse
            reste secrète jusqu&apos;au combat.
          </p>
        </div>
        <div className="slots">
          {Array.from({ length: teamSize }, (_, i) => {
            const c = byId.get(team[i]);
            return (
              <button key={i} type="button" className={`slot ${c ? "filled" : ""}`} onClick={() => c && toggle(c.id)} title={c ? "Retirer" : undefined}>
                <span className="slot-num">{i + 1}</span>
                {c ? <GameCard card={c} size="xs" /> : <span className="slot-empty">Carte {i + 1}</span>}
              </button>
            );
          })}
        </div>
        <div className="row">
          <button type="button" className="btn" disabled={!ready || pending} onClick={() => fight("training")}>
            🥋 Entraînement
          </button>
          <button type="button" className="btn btn-ghost" disabled={!ready || pending} onClick={saveDefense}>
            🛡 Utiliser en défense
          </button>
          {team.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => update([])}>
              Vider
            </button>
          )}
        </div>
        {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
        <p className="muted small-text">
          Ta défense actuelle :{" "}
          {defenseIds.length
            ? defenseIds.map((id) => byId.get(id)?.name ?? "?").join(" · ")
            : "tes 3 cartes les plus fortes (choisis une équipe et clique sur « Utiliser en défense »)"}
        </p>
      </div>

      <div className="lobby-cols">
        <div className="panel">
          <h2>Tes cartes</h2>
          {cards.length < teamSize ? (
            <p className="muted">Il te faut au moins {teamSize} cartes différentes pour combattre. Ouvre des boosters !</p>
          ) : (
            <div className="duel-pick-grid">
              {cards.map((c) => {
                const pos = team.indexOf(c.id);
                return (
                  <button key={c.id} type="button" className={`duel-pick ${pos >= 0 ? "picked" : ""}`} onClick={() => toggle(c.id)}>
                    {pos >= 0 && <span className="pick-pos">{pos + 1}</span>}
                    <GameCard card={c} size="xs" />
                    <span className="pick-stats">
                      <b>{c.attack}</b> ATK · <b>{c.defense}</b> DEF · {ELEMENTS[c.element].kanji}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Défier un membre</h2>
          <p className="muted small-text">
            {duelsLeft} duel{duelsLeft > 1 ? "s" : ""} restant{duelsLeft > 1 ? "s" : ""} aujourd&apos;hui
            {rewardAvailable ? " · 🎁 ta première victoire du jour rapporte un booster bonus !" : " · récompense du jour déjà gagnée"}
          </p>
          {opponents.length === 0 ? (
            <p className="muted">Personne d&apos;autre n&apos;a encore {teamSize} cartes. Entraîne-toi en attendant !</p>
          ) : (
            <ul className="opponents">
              {opponents.map((o) => (
                <li key={o.id} className={o.id === highlight ? "highlight" : ""}>
                  {o.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.image} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="avatar-fallback">{o.name?.[0] ?? "?"}</span>
                  )}
                  <span className="opp-name">
                    <NameWithBadge name={o.name} badge={o.badge} />
                    <small className="muted">
                      {o.wins} V · {o.losses} D
                    </small>
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={!ready || pending || duelsLeft <= 0 || o.foughtToday >= sameOpponentLimit}
                    onClick={() => fight(o.id)}
                    title={o.foughtToday >= sameOpponentLimit ? "Déjà défié assez de fois aujourd'hui" : undefined}
                  >
                    ⚔ Défier
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
