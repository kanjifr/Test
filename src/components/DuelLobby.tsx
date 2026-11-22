"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveDefenseTeam, startDuel } from "@/app/duels/actions";
import { GameCard } from "@/components/GameCard";
import { NameWithBadge } from "@/components/Badge";
import { ELEMENTS, type CardView } from "@/lib/game";
import type { BadgeView } from "@/lib/achievements";

export type Opponent = {
  id: string;
  name: string | null;
  image: string | null;
  wins: number;
  losses: number;
  badge: BadgeView | null;
  foughtToday: number;
  rating: number;
  tier: { label: string; kanji: string; color: string };
  /** Points gagnés en cas de victoire, perdus en cas de défaite */
  stakes: { win: number; loss: number };
};

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
  // Emplacements fixes (null = vide) : on peut déposer une carte dans n'importe lequel
  const [slots, setSlots] = useState<(string | null)[]>(() => Array(teamSize).fill(null));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [defenseIds, setDefenseIds] = useState(defense);
  const [pending, start] = useTransition();
  const byId = new Map(cards.map((c) => [c.id, c]));
  const team = slots.filter((id): id is string => !!id);

  // On retrouve la dernière équipe utilisée
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(saved)) {
        const next = Array.from({ length: teamSize }, (_, i) => (cards.some((c) => c.id === saved[i]) ? (saved[i] as string) : null));
        setSlots(next);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const update = (next: (string | null)[]) => {
    setSlots(next);
    setMsg(null);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };
  /** Clic : ajoute la carte dans le premier emplacement libre, ou la retire. */
  const toggle = (id: string) => {
    if (slots.includes(id)) return update(slots.map((s) => (s === id ? null : s)));
    const free = slots.indexOf(null);
    if (free >= 0) update(slots.map((s, i) => (i === free ? id : s)));
  };
  /** Dépôt d'une carte dans l'emplacement i (échange si elle venait d'un autre emplacement). */
  const dropInto = (id: string, i: number) => {
    const from = slots.indexOf(id);
    const next = [...slots];
    if (from >= 0) next[from] = next[i];
    next[i] = id;
    update(next);
  };

  // ---- Glisser-déposer (souris et tactile, via les Pointer Events) ----
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  // Les emplacements sont hors de l'écran (mobile, page défilée) : on affiche une barre de dépôt
  const [dock, setDock] = useState(false);
  const slotsRef = useRef<HTMLDivElement>(null);
  const startDrag = (id: string, x: number, y: number) => {
    const r = slotsRef.current?.getBoundingClientRect();
    setDock(!!r && (r.bottom < 40 || r.top > window.innerHeight - 40));
    setDrag({ id, x, y });
  };
  const dragRef = useRef<{ id: string; fromSlot: boolean; sx: number; sy: number; active: boolean; timer?: number } | null>(null);
  const justDragged = useRef(false);

  useEffect(() => {
    const slotAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-slot]");
      return el ? Number(el.dataset.slot) : null;
    };
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.active) {
        // Souris : le glisser commence après quelques pixels. Tactile : après un appui long (voir down)
        if (e.pointerType !== "touch" && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) d.active = true;
        else if (e.pointerType === "touch" && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 10) {
          window.clearTimeout(d.timer);
          dragRef.current = null;
          return;
        }
        if (!d.active) return;
      }
      setDrag((cur) => {
        if (!cur) {
          const r = slotsRef.current?.getBoundingClientRect();
          setDock(!!r && (r.bottom < 40 || r.top > window.innerHeight - 40));
        }
        return { id: d.id, x: e.clientX, y: e.clientY };
      });
      setOver(slotAt(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      window.clearTimeout(d.timer);
      if (!d.active) return;
      justDragged.current = true;
      window.setTimeout(() => (justDragged.current = false), 0);
      const target = slotAt(e.clientX, e.clientY);
      setDrag(null);
      setOver(null);
      setSlots((cur) => {
        const next = [...cur];
        const from = next.indexOf(d.id);
        if (target !== null) {
          if (from >= 0) next[from] = next[target];
          next[target] = d.id;
        } else if (d.fromSlot && from >= 0) next[from] = null; // lâchée hors des emplacements : retirée
        else return cur;
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      setMsg(null);
    };
    const cancel = () => {
      if (dragRef.current) window.clearTimeout(dragRef.current.timer);
      dragRef.current = null;
      setDrag(null);
      setOver(null);
    };
    // Pendant un glisser au doigt, on empêche la page de défiler
    const touchMove = (e: TouchEvent) => {
      if (dragRef.current?.active) e.preventDefault();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchmove", touchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("touchmove", touchMove);
    };
  }, []);

  const dragProps = (id: string, fromSlot: boolean) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const d = { id, fromSlot, sx: e.clientX, sy: e.clientY, active: false } as NonNullable<typeof dragRef.current>;
      if (e.pointerType === "touch") {
        const { clientX: x, clientY: y } = e;
        d.timer = window.setTimeout(() => {
          if (dragRef.current !== d) return;
          d.active = true;
          navigator.vibrate?.(15);
          startDrag(id, x, y);
        }, 220);
      }
      dragRef.current = d;
    },
    onContextMenu: (e: React.MouseEvent) => {
      if (dragRef.current) e.preventDefault();
    },
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
  });
  const onClickGuard = (fn: () => void) => () => {
    if (!justDragged.current) fn();
  };

  const ready = team.length === teamSize;
  const dragged = drag ? byId.get(drag.id) : null;

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
    <div className={`lobby ${drag ? "is-dragging" : ""}`}>
      {drag && dock && (
        <div className="drop-dock" aria-hidden="true">
          {slots.map((id, i) => (
            <div key={i} data-slot={i} className={`dock-slot ${over === i ? "over" : ""}`}>
              <b>{i + 1}</b>
              <span>{id ? byId.get(id)?.name : "Vide"}</span>
            </div>
          ))}
        </div>
      )}
      {drag && dragged && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <GameCard card={dragged} size="xs" />
        </div>
      )}
      <div className="panel lobby-team">
        <div className="lobby-head">
          <h2>Ton équipe</h2>
          <p className="muted small-text">
            Glisse {teamSize} cartes dans les emplacements (ou clique dessus) : ta carte 1 affronte la carte 1 adverse,
            etc. Glisse une carte d&apos;un emplacement à l&apos;autre pour changer l&apos;ordre, ou hors des emplacements pour
            la retirer. L&apos;équipe adverse reste secrète jusqu&apos;au combat.
          </p>
        </div>
        <div className="slots" ref={slotsRef}>
          {Array.from({ length: teamSize }, (_, i) => {
            const c = slots[i] ? byId.get(slots[i]!) : undefined;
            return (
              <button
                key={i}
                type="button"
                data-slot={i}
                className={`slot ${c ? "filled" : ""} ${over === i ? "over" : ""} ${drag && c?.id === drag.id ? "dragging" : ""}`}
                onClick={onClickGuard(() => c && toggle(c.id))}
                title={c ? "Glisser pour déplacer · cliquer pour retirer" : "Dépose une carte ici"}
                {...(c ? dragProps(c.id, true) : {})}
              >
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => update(Array(teamSize).fill(null))}>
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
                const pos = slots.indexOf(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`duel-pick ${pos >= 0 ? "picked" : ""} ${drag?.id === c.id ? "dragging" : ""}`}
                    onClick={onClickGuard(() => toggle(c.id))}
                    {...dragProps(c.id, pos >= 0)}
                  >
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
            {rewardAvailable ? " · 🎁 ta première victoire du jour (contre un adversaire de ton niveau) rapporte un booster bonus !" : " · récompense du jour déjà gagnée"}
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
                      <b style={{ color: o.tier.color }}>
                        {o.tier.kanji} {o.rating}
                      </b>{" "}
                      · {o.wins} V · {o.losses} D
                    </small>
                    <small className="stakes">
                      <span className="plus">+{o.stakes.win}</span> / <span className="minus">{o.stakes.loss}</span>
                      {o.stakes.win < 8 && <span className="muted"> · trop faible pour toi</span>}
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
