"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { openPack, type OpenResult } from "@/app/actions";
import { CardBack, GameCard } from "@/components/GameCard";
import { RARITIES } from "@/lib/game";
import { holdAchievementToasts } from "@/components/AchievementToasts";

type Pulled = Extract<OpenResult, { ok: true }>["cards"][number];
type Phase = "idle" | "tearing" | "stack" | "done";

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
  children,
}: {
  initialNextAt: number;
  serverNow: number;
  siteName: string;
  packSize: number;
  /** Contenu affiché sous le booster uniquement hors révélation (ex. derniers grands tirages) */
  children?: React.ReactNode;
}) {
  const [nextAt, setNextAt] = useState(initialNextAt);
  const [now, setNow] = useState(serverNow);
  const [phase, setPhase] = useState<Phase>("idle");
  const [cards, setCards] = useState<Pulled[]>([]);
  const [idx, setIdx] = useState(0);
  const [leaving, setLeaving] = useState(false);
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

  const ready = now >= nextAt;
  const revealed = phase === "done";

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

  // Flash lumineux quand une Épique ou une Légendaire apparaît en haut de la pile
  useEffect(() => {
    if (phase !== "stack") return;
    const r = cards[idx]?.rarity;
    if (r === "LEGENDAIRE" || r === "EPIQUE") {
      setFlash(RARITIES[r].color);
      const t = setTimeout(() => setFlash(null), 900);
      return () => clearTimeout(t);
    }
  }, [phase, idx, cards]);

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
      setCards(res.cards);
      setIdx(0);
      setLeaving(false);
      setPhase("tearing");
      setTimeout(() => setPhase("stack"), 1300);
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

  return (
    <div className="opener">
      {flash && <div className="flash" style={{ "--fc": flash } as React.CSSProperties} />}

      {(phase === "idle" || phase === "tearing") && (
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

      {phase === "stack" && cards[idx] && (
        <div className="stack-stage">
          <p className="stack-count">
            Carte {idx + 1} / {cards.length}
          </p>
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
              className={`stack-top glow-${cards[idx].rarity.toLowerCase()} ${leaving ? "leaving" : ""}`}
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
          <div className="deal">
            {cards.map((c, i) => (
              <div key={i} className="deal-card" style={{ animationDelay: `${i * 90}ms` }}>
                <GameCard card={c} badge={c.isNew ? "NOUVEAU" : undefined} />
              </div>
            ))}
          </div>
          <div className="deal-actions">
            <Link href="/collection" className="btn">
              Voir ma collection
            </Link>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              {ready ? "Ouvrir un autre booster" : `Prochain booster : ${formatLeft(nextAt - now)}`}
            </button>
          </div>
        </>
      )}

      {phase === "idle" && children}
    </div>
  );
}
