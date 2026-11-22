"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { evolveCard } from "@/app/collection/actions";
import { levelCost, LEVEL_BONUS, MAX_LEVEL } from "@/lib/evolution";
import { play } from "@/lib/sfx";
import type { Rarity } from "@prisma/client";
import { CardBack, GameCard } from "@/components/GameCard";
import { ELEMENTS, RARITIES, RARITY_ORDER, type CardView } from "@/lib/game";

export type GridItem = {
  card: CardView;
  count: number;
  shiny?: number;
  seriesId?: string | null;
  /** Statistiques de base, avant le bonus de niveau */
  base?: { attack: number; defense: number };
};
export type SeriesOption = { id: string; name: string };

type Sort = "number" | "rarity-desc" | "rarity-asc" | "count";
type Prefs = { sort: Sort; rarity: Rarity | "ALL"; ownedOnly: boolean; shinyOnly?: boolean; series?: string };

const SORTS: { value: Sort; label: string }[] = [
  { value: "number", label: "Numéro" },
  { value: "rarity-desc", label: "Rareté (plus rares d'abord)" },
  { value: "rarity-asc", label: "Rareté (plus communes d'abord)" },
  { value: "count", label: "Exemplaires possédés" },
];
const DEFAULT_PREFS: Prefs = { sort: "number", rarity: "ALL", ownedOnly: false };
const STORAGE_KEY = "kizuna.collection.prefs";

const rank = (r: Rarity) => RARITY_ORDER.indexOf(r);

function Tile({ it, onOpen }: { it: GridItem; onOpen: (it: GridItem) => void }) {
  return it.count > 0 ? (
    <button type="button" className="grid-item" onClick={() => onOpen(it)}>
      <GameCard card={it.card} size="sm" count={it.count} />
    </button>
  ) : (
    <div className="grid-item missing" title="Pas encore obtenue">
      <CardBack size="sm" label={`#${String(it.card.number).padStart(3, "0")}`} />
    </div>
  );
}

/** Filtre de série : "ALL", l'id d'une série, "none" (hors série), "event" ou "alt". */
const matchSeries = (it: GridItem, f: string | undefined) =>
  !f || f === "ALL"
    ? true
    : f === "event"
      ? !!it.card.event
      : f === "alt"
        ? !!it.card.alt
        : f === "none"
          ? !it.seriesId
          : it.seriesId === f;

export function CardGrid({ items, series = [], canEvolve = false }: { items: GridItem[]; series?: SeriesOption[]; canEvolve?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? (items.find((it) => it.card.id === openId) ?? null) : null;
  const setOpen = (it: GridItem | null) => {
    setOpenId(it?.card.id ?? null);
    setEvolveMsg(null);
  };
  const router = useRouter();
  const [evolving, startEvolve] = useTransition();
  const [evolveMsg, setEvolveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [flash, setFlash] = useState(0);
  function evolve(id: string) {
    startEvolve(async () => {
      const res = await evolveCard(id);
      if (res.ok) {
        play("legendary");
        setFlash((f) => f + 1);
        setEvolveMsg({ ok: true, text: `✨ Ta carte passe au niveau ${res.level} !` });
        router.refresh();
      } else setEvolveMsg({ ok: false, text: res.error });
    });
  }
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  // Les préférences de tri sont mémorisées dans ce navigateur uniquement
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved && typeof saved === "object") setPrefs({ ...DEFAULT_PREFS, ...saved });
    } catch {}
  }, []);
  const update = (p: Partial<Prefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...p };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown = useMemo(() => {
    const list = items.filter(
      (it) =>
        (prefs.rarity === "ALL" || it.card.rarity === prefs.rarity) &&
        (!prefs.ownedOnly || it.count > 0) &&
        (!prefs.shinyOnly || (it.shiny ?? 0) > 0) &&
        matchSeries(it, series.length || prefs.series === "event" || prefs.series === "alt" ? prefs.series : "ALL"),
    );
    const byNumber = (a: GridItem, b: GridItem) => a.card.number - b.card.number;
    const cmp: Record<Sort, (a: GridItem, b: GridItem) => number> = {
      number: byNumber,
      "rarity-desc": (a, b) => rank(b.card.rarity) - rank(a.card.rarity) || byNumber(a, b),
      "rarity-asc": (a, b) => rank(a.card.rarity) - rank(b.card.rarity) || byNumber(a, b),
      count: (a, b) => b.count - a.count || rank(b.card.rarity) - rank(a.card.rarity) || byNumber(a, b),
    };
    return [...list].sort(cmp[prefs.sort]);
  }, [items, prefs]);

  // Avec un tri par rareté, on affiche une section par rareté
  const grouped = prefs.sort === "rarity-desc" || prefs.sort === "rarity-asc";
  const groups = grouped
    ? (prefs.sort === "rarity-desc" ? [...RARITY_ORDER].reverse() : RARITY_ORDER)
        .map((r) => ({ rarity: r, list: shown.filter((it) => it.card.rarity === r) }))
        .filter((g) => g.list.length > 0)
    : [];

  return (
    <>
      <div className="grid-controls">
        <div className="chips" role="group" aria-label="Filtrer par rareté">
          <button
            type="button"
            className={`chip ${prefs.rarity === "ALL" ? "on" : ""}`}
            onClick={() => update({ rarity: "ALL" })}
          >
            Toutes
          </button>
          {RARITY_ORDER.map((r) => (
            <button
              key={r}
              type="button"
              className={`chip ${prefs.rarity === r ? "on" : ""}`}
              style={{ "--cc": RARITIES[r].color } as React.CSSProperties}
              onClick={() => update({ rarity: r })}
            >
              {RARITIES[r].label}
            </button>
          ))}
        </div>
        <div className="row">
          {(series.length > 1 || items.some((it) => it.card.event || it.card.alt)) && (
            <label className="inline">
              Série
              <select value={prefs.series ?? "ALL"} onChange={(e) => update({ series: e.target.value })}>
                <option value="ALL">Toutes</option>
                {series.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
                {items.some((it) => !it.seriesId) && <option value="none">Hors série</option>}
                {items.some((it) => it.card.event) && <option value="event">✿ Cartes d&apos;événement</option>}
                {items.some((it) => it.card.alt) && <option value="alt">Versions alternatives</option>}
              </select>
            </label>
          )}
          <label className="inline">
            Trier par
            <select value={prefs.sort} onChange={(e) => update({ sort: e.target.value as Sort })}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="switch">
            <input type="checkbox" checked={prefs.ownedOnly} onChange={(e) => update({ ownedOnly: e.target.checked })} />
            <span>Seulement les cartes obtenues</span>
          </label>
          <label className="switch">
            <input type="checkbox" checked={!!prefs.shinyOnly} onChange={(e) => update({ shinyOnly: e.target.checked })} />
            <span>✦ Brillantes</span>
          </label>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="muted">Aucune carte ne correspond à ces filtres.</p>
      ) : grouped ? (
        groups.map((g) => (
          <section key={g.rarity} className="rarity-group">
            <h2 style={{ color: RARITIES[g.rarity].color }}>
              {RARITIES[g.rarity].label}{" "}
              <span className="muted">
                {g.list.filter((it) => it.count > 0).length}/{g.list.length}
              </span>
            </h2>
            <div className="grid">
              {g.list.map((it) => (
                <Tile key={it.card.id} it={it} onOpen={setOpen} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="grid">
          {shown.map((it) => (
            <Tile key={it.card.id} it={it} onOpen={setOpen} />
          ))}
        </div>
      )}

      {open && (
        <div className="modal" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
          <div className="modal-body" onClick={(e) => e.stopPropagation()}>
            <div key={flash} className={flash ? "evolve-flash" : undefined}>
              <GameCard card={open.card} size="lg" />
            </div>
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
              {open.count > 0 && (() => {
                const level = open.card.level ?? 1;
                const normal = open.count - (open.shiny ?? 0);
                const cost = levelCost(level);
                // On garde toujours un exemplaire : avec une brillante, tous les normaux sont fusionnables
                const usable = (open.shiny ?? 0) > 0 ? normal : normal - 1;
                return (
                  <div className="evolve-box">
                    <p>
                      <span className="lvl-stars" aria-label={`Niveau ${level} sur ${MAX_LEVEL}`}>
                        {"★".repeat(level)}
                        <span className="muted">{"☆".repeat(MAX_LEVEL - level)}</span>
                      </span>{" "}
                      <b>Niveau {level}</b>
                      {level > 1 && open.base && (
                        <span className="muted small-text">
                          {" "}
                          · ATK {open.base.attack} → <b>{open.card.attack}</b>, DEF {open.base.defense} → <b>{open.card.defense}</b> en duel
                        </span>
                      )}
                    </p>
                    {level >= MAX_LEVEL ? (
                      <p className="small-text">🏆 Forme ultime atteinte !</p>
                    ) : canEvolve ? (
                      <>
                        <p className="small-text muted">
                          Fusionne {cost} doublon{cost > 1 ? "s" : ""} pour passer au niveau {level + 1} (+{Math.round(LEVEL_BONUS * 100)} % d&apos;ATK et de
                          DEF). Tu as {Math.max(0, usable)} doublon{usable > 1 ? "s" : ""} utilisable{usable > 1 ? "s" : ""}. Les brillantes ne sont jamais fusionnées.
                        </p>
                        <button type="button" className="btn btn-sm" disabled={evolving || usable < cost} onClick={() => evolve(open.card.id)}>
                          ⬆ Faire évoluer ({cost} doublon{cost > 1 ? "s" : ""})
                        </button>
                      </>
                    ) : null}
                    {evolveMsg && <p className={evolveMsg.ok ? "success" : "error"}>{evolveMsg.text}</p>}
                  </div>
                );
              })()}
              <p className="muted">
                Exemplaires possédés : {open.count}
                {(open.shiny ?? 0) > 0 && ` (dont ${open.shiny} brillante${(open.shiny ?? 0) > 1 ? "s" : ""} ✦)`}
              </p>
              <p className="row">
                <a className="btn" href={`/carte/${open.card.id}`}>
                  📖 Fiche & livre d&apos;or
                </a>
                <a className="btn btn-ghost" href={`/api/cartes/${open.card.id}/image${(open.shiny ?? 0) > 0 ? "?brillante=1" : ""}`} download={`kizuna-${open.card.name}.png`}>
                  🖼️ Image
                </a>
              </p>
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
