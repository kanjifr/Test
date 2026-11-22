"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { openPack, type OpenResult } from "@/app/actions";
import { CardBack, GameCard } from "@/components/GameCard";
import { RARITIES, RARITY_ORDER } from "@/lib/game";
import { holdAchievementToasts } from "@/components/AchievementToasts";
import { play, playReveal } from "@/lib/sfx";

type Pulled = Extract<OpenResult, { ok: true }>["cards"][number];
type Phase = "idle" | "tearing" | "stack" | "done";

function formatLeft(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h > 0 ? `${h}h ` : ""}${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

export type RateInfo = { label: string; color: string; pct: string };

/** Vidéo plein écran jouée à l'obtention d'une carte Mythique. */
function Cinematic({ card, onClose }: { card: Pulled; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // Le son n'est pas toujours autorisé par le navigateur : on relance sans son si besoin
    v.play().catch(() => {
      v.muted = true;
      setMuted(true);
      v.play().catch(onClose);
    });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="cinema" role="dialog" aria-modal="true" aria-label={`Carte Mythique : ${card.name}`}>
      <p className="cinema-title">✦ Mythique ✦</p>
      <video ref={ref} src={card.videoUrl ?? undefined} playsInline onEnded={onClose} onError={onClose} />
      <div className="cinema-actions">
        {muted && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (ref.current) ref.current.muted = false;
              setMuted(false);
            }}
          >
            🔊 Activer le son
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Passer ⏭
        </button>
      </div>
    </div>
  );
}

export function PackOpener({
  initialNextAt,
  serverNow,
  siteName,
  packSize,
  initialPity,
  initialBonus,
  pityHard,
  pitySoft,
  mythicAvailable,
  rates,
  children,
}: {
  initialNextAt: number;
  serverNow: number;
  siteName: string;
  packSize: number;
  initialPity: number;
  initialBonus: number;
  pityHard: number;
  pitySoft: number;
  mythicAvailable: boolean;
  rates: RateInfo[];
  /** Contenu affiché sous le booster uniquement hors révélation (ex. derniers grands tirages) */
  children?: React.ReactNode;
}) {
  const [nextAt, setNextAt] = useState(initialNextAt);
  const [now, setNow] = useState(serverNow);
  const [phase, setPhase] = useState<Phase>("idle");
  const [cards, setCards] = useState<Pulled[]>([]);
  const [idx, setIdx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [pity, setPity] = useState(initialPity);
  const [bonus, setBonus] = useState(initialBonus);
  // Boosters bonus gagnés ailleurs sur la page (quêtes de la semaine)
  useEffect(() => {
    const on = (e: Event) => setBonus(Number((e as CustomEvent).detail) || 0);
    window.addEventListener("kizuna:bonus", on);
    return () => window.removeEventListener("kizuna:bonus", on);
  }, []);
  const [mythicOn, setMythicOn] = useState(mythicAvailable);
  const [cinema, setCinema] = useState<Pulled | null>(null);
  const played = useRef(new Set<number>());
  const openerRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => () => holdAchievementToasts(false), []);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const timerReady = now >= nextAt;
  // Un booster bonus s'ouvre même quand le minuteur n'est pas fini
  const ready = timerReady || bonus > 0;
  const revealed = phase === "done";
  // Meilleure rareté du booster : le paquet s'illumine pendant l'ouverture
  const best = cards.some((c) => c.rarity === "MYTHIQUE")
    ? "mythique"
    : cards.some((c) => c.rarity === "LEGENDAIRE")
      ? "legendaire"
      : cards.some((c) => c.rarity === "EPIQUE")
        ? "epique"
        : null;

  // Une Mythique avec vidéo arrive en haut de la pile : cinématique avant d'afficher la carte
  useLayoutEffect(() => {
    if (phase !== "stack") return;
    const c = cards[idx];
    if (c?.rarity === "MYTHIQUE" && c.videoUrl && !played.current.has(idx)) {
      played.current.add(idx);
      setCinema(c);
    }
  }, [phase, idx, cards]);

  // La révélation est plus courte que la page du booster : on remonte à son début si besoin
  useEffect(() => {
    if (phase !== "stack" && phase !== "done") return;
    const el = openerRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [phase]);

  // Les succès s'affichent seulement après la révélation, pour ne rien gâcher
  useEffect(() => {
    if (revealed) {
      const t = setTimeout(() => {
        holdAchievementToasts(false);
        router.refresh();
      }, 900);
      return () => clearTimeout(t);
    }
  }, [revealed, router]);

  // Son de révélation, puis flash lumineux pour les Épiques, Légendaires et Mythiques
  useEffect(() => {
    if (phase !== "stack" || cinema) return;
    const r = cards[idx]?.rarity;
    if (r) playReveal(r);
    if (cards[idx]?.shiny) setTimeout(() => play("shiny"), 250);
    if (r === "LEGENDAIRE" || r === "EPIQUE" || r === "MYTHIQUE" || cards[idx]?.shiny) {
      setFlash(r && r !== "COMMUNE" && r !== "RARE" ? RARITIES[r].color : "#ffffff");
      const t = setTimeout(() => setFlash(null), 900);
      return () => clearTimeout(t);
    }
  }, [phase, idx, cards, cinema]);

  function open() {
    setError(null);
    holdAchievementToasts(true);
    startTransition(async () => {
      const res = await openPack();
      if (!res.ok) {
        holdAchievementToasts(false);
        setError(res.error);
        if (res.nextAt) setNextAt(res.nextAt);
        return;
      }
      setNextAt(res.nextAt);
      setPity(res.pity);
      setBonus(res.bonus);
      // Met à jour l'anneau du menu et le badge de l'onglet « Ouvrir »
      window.dispatchEvent(new CustomEvent("kizuna:pack", { detail: { nextAt: res.nextAt, bonus: res.bonus } }));
      setMythicOn(res.mythicAvailable);
      setCards(res.cards);
      setIdx(0);
      setLeaving(false);
      played.current = new Set();
      setPhase("tearing");
      play("tear");
      const has = (r: Pulled["rarity"]) => res.cards.some((c) => c.rarity === r);
      const top = has("MYTHIQUE") ? 2800 : has("LEGENDAIRE") ? 2200 : has("EPIQUE") ? 1800 : 1300;
      setTimeout(() => setPhase("stack"), top);
    });
  }

  // Clic sur la carte du dessus : elle s'envole et dévoile celle de derrière
  function next() {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => {
      setLeaving(false);
      if (idx >= cards.length - 1) setPhase("done");
      else setIdx((i) => i + 1);
    }, 380);
  }

  function reset() {
    setPhase("idle");
    setCards([]);
    setIdx(0);
  }

  const pityPct = Math.min(100, Math.round((pity / pityHard) * 100));
  const left = Math.max(1, pityHard - pity);

  return (
    <div className="opener" ref={openerRef}>
      {flash && <div className="flash" style={{ "--fc": flash } as React.CSSProperties} />}
      {cinema && <Cinematic card={cinema} onClose={() => setCinema(null)} />}

      {(phase === "idle" || phase === "tearing") && (
        <div className={`booster-layout ${phase === "tearing" ? "is-tearing" : ""}`}>
          <section className="pack-stage" aria-label="Ouvrir un booster">
            <span className="moon" aria-hidden />
            <p className="pack-hello">
              {ready ? (timerReady ? "Ton booster t'attend !" : "Un booster bonus t'attend !") : "Ton prochain booster arrive…"}
            </p>
            <button
              type="button"
              className={`pack ${phase === "tearing" ? `tearing ${best ? `aura aura-${best}` : ""}` : ""} ${pending ? "shaking" : ""} ${
                phase !== "idle" ? "" : ready ? "ready" : "locked"
              }`}
              onClick={open}
              disabled={!ready || pending || phase !== "idle"}
              aria-label="Ouvrir le booster"
            >
              <span className="pack-top" />
              <span className="pack-body">
                <span className="pack-spark s1" aria-hidden />
                <span className="pack-spark s2" aria-hidden />
                <span className="pack-kanji">絆</span>
                <span className="pack-name">{siteName}</span>
                <span className="pack-sub">Booster · {packSize} cartes</span>
              </span>
            </button>
            <button type="button" className="btn btn-open" onClick={open} disabled={!ready || pending || phase !== "idle"}>
              {pending ? "Ouverture…" : ready ? (timerReady ? "Ouvrir !" : "Ouvrir un bonus !") : formatLeft(nextAt - now)}
            </button>
            {bonus > 0 && (
              <p className="bonus-chip">
                🎁 {bonus} booster{bonus > 1 ? "s" : ""} bonus en réserve
              </p>
            )}
            {error && <p className="error">{error}</p>}
          </section>

          <aside className="booster-aside" aria-hidden={phase === "tearing" ? true : undefined}>
            {mythicOn && (
              <section className="panel pity" aria-label="Jauge Mythique">
                <div className="pity-head">
                  <span className="pity-label">Jauge Mythique</span>
                  <span className="pity-value">
                    {pity}
                    <small> / {pityHard}</small>
                  </span>
                </div>
                <div
                  className="pity-bar"
                  style={{ "--soft": `${(pitySoft / pityHard) * 100}%` } as React.CSSProperties}
                  role="progressbar"
                  aria-label="Jauge Mythique"
                  aria-valuemin={0}
                  aria-valuemax={pityHard}
                  aria-valuenow={pity}
                >
                  <span style={{ width: `${pityPct}%` }} />
                </div>
                <p className="pity-text">
                  {pity >= pitySoft ? "🔥 Chance de Mythique augmentée ! " : ""}
                  Mythique <b>garantie dans {left} booster{left > 1 ? "s" : ""}</b>. Après le trait doré, la chance s&apos;envole.
                </p>
              </section>
            )}

            <section className="panel timer-panel" aria-label="Prochain booster gratuit">
              <span className="panel-label">Prochain booster gratuit</span>
              <span className="timer-big">{timerReady ? "Disponible !" : formatLeft(nextAt - now)}</span>
              <Link href="/recyclage" className="btn btn-ghost btn-sm">
                ♻ Recycler 10 doublons
              </Link>
            </section>

            {children}

            <details className="panel rates">
              <summary>Taux de drop</summary>
              <ul>
                {rates.map((r) => (
                  <li key={r.label}>
                    <span style={{ color: r.color }}>{r.label}</span>
                    <span>{r.pct}</span>
                  </li>
                ))}
              </ul>
              <p className="muted">
                La dernière carte de chaque booster est au moins Rare.
                {mythicOn &&
                  ` Mythique : chance qui augmente à partir du ${pitySoft + 1}e booster sans Mythique, garantie au ${pityHard}e. La jauge repart à zéro quand tu en obtiens une.`}
              </p>
            </details>
          </aside>
        </div>
      )}

      {phase === "stack" && cards[idx] && (
        <div className={`stack-stage burst-${cards[idx].rarity.toLowerCase()} ${cards[idx].shiny ? "burst-shiny" : ""} ${cinema ? "is-cinema" : ""}`}>
          <p className="stack-count">
            Carte {idx + 1} / {cards.length}
          </p>
          {/* Étoiles de rareté, et grand titre lumineux à partir d'Épique */}
          <div className="rarity-callout" key={`call-${idx}`}>
            {cards[idx].shiny && <p className="shiny-title">✦ Brillante ! ✦</p>}
            {RARITY_ORDER.indexOf(cards[idx].rarity) >= 2 && (
              <p className="rarity-title">{RARITIES[cards[idx].rarity].label} !</p>
            )}
            <p className="rarity-stars" role="img" aria-label={`${RARITY_ORDER.indexOf(cards[idx].rarity) + 1} étoile(s)`}>
              {"★".repeat(RARITY_ORDER.indexOf(cards[idx].rarity) + 1)}
            </p>
          </div>
          <div className="stack">
            {/* Dos des cartes restantes, légèrement décalés pour donner l'effet de pile */}
            {cards.slice(idx + 1).map((_, j, rest) => {
              const depth = Math.min(rest.length - j, 4);
              return (
                <span key={j} className="stack-layer" style={{ "--d": depth } as React.CSSProperties}>
                  <CardBack size="lg" />
                </span>
              );
            })}
            <button
              type="button"
              key={idx}
              className={`stack-top glow-${cards[idx].rarity.toLowerCase()} ${leaving ? "leaving" : ""} ${cinema ? "hidden" : ""}`}
              onClick={next}
              aria-label={idx < cards.length - 1 ? "Découvrir la carte suivante" : "Terminer"}
            >
              <GameCard card={cards[idx]} size="lg" badge={cards[idx].isNew ? "NOUVEAU" : undefined} />
            </button>
          </div>
          <p className="stack-hint">
            {idx < cards.length - 1 ? "Clique sur la carte pour découvrir la suivante" : "Clique pour voir tout ton tirage"}
          </p>
          {idx > 0 && (
            <div className="stack-seen" aria-label="Cartes déjà vues">
              {cards.slice(0, idx).map((c, j) => (
                <GameCard key={j} card={c} size="xs" />
              ))}
            </div>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPhase("done")}>
            Tout afficher
          </button>
        </div>
      )}

      {phase === "done" && (
        <>
          <h2 className="deal-title">Ton tirage</h2>
          <div className="deal">
            {cards.map((c, i) => (
              <div key={i} className={`deal-card glow-${c.rarity.toLowerCase()}`} style={{ animationDelay: `${i * 90}ms` }}>
                <GameCard card={c} badge={c.isNew ? "NOUVEAU" : undefined} />
              </div>
            ))}
          </div>
          <div className="deal-actions">
            <Link href="/collection" className="btn">
              Voir ma collection
            </Link>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              {ready
                ? bonus > 0 && !timerReady
                  ? `Ouvrir un booster bonus (${bonus})`
                  : "Ouvrir un autre booster"
                : `Prochain booster : ${formatLeft(nextAt - now)}`}
            </button>
          </div>
        </>
      )}

    </div>
  );
}
