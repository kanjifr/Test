import { ELEMENTS, RARITIES, type CardView } from "@/lib/game";
import { MAX_LEVEL } from "@/lib/evolution";

type Props = {
  card: CardView;
  size?: "xs" | "sm" | "md" | "lg";
  badge?: string;
  count?: number;
};

export function GameCard({ card, size = "md", badge, count }: Props) {
  const r = RARITIES[card.rarity];
  const el = ELEMENTS[card.element];
  const initials = card.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className={`gcard gcard-${size} rarity-${card.rarity.toLowerCase()} ${card.birthday ? "is-birthday" : ""} ${card.shiny ? "is-shiny" : ""} ${(card.level ?? 1) > 1 ? `lvl-${card.level}` : ""} ${card.level === MAX_LEVEL ? "lvl-max" : ""}`}
      style={{ "--rc": r.color, "--ec": el.color } as React.CSSProperties}
    >
      <div className="gcard-inner">
        <div className="gcard-top">
          <span className="gcard-num">#{String(card.number).padStart(3, "0")}</span>
          <span className="gcard-rarity">{r.label}</span>
          <span className="gcard-el" title={el.label}>
            {el.kanji}
          </span>
        </div>
        <div className="gcard-art">
          {card.videoUrl && size !== "xs" ? (
            <video
              src={card.videoUrl}
              poster={card.imageUrl ?? undefined}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label={card.name}
            />
          ) : card.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.imageUrl} alt={card.name} loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <div className="gcard-placeholder">
              <span className="ph-kanji">{el.kanji}</span>
              <span className="ph-initials">{initials}</span>
            </div>
          )}
          {card.title && <span className="gcard-vertical">{card.title}</span>}
        </div>
        <div className="gcard-bottom">
          {(card.level ?? 1) > 1 && (
            <div className="gcard-level" aria-label={`Niveau ${card.level} sur ${MAX_LEVEL}`} title={`Niveau ${card.level} : ATK et DEF augmentées`}>
              {"★".repeat(card.level!)}
              <span className="lvl-empty">{"★".repeat(MAX_LEVEL - card.level!)}</span>
            </div>
          )}
          <div className="gcard-name">{card.name}</div>
          <div className="gcard-stats">
            <span>
              <b>ATK</b> {card.attack}
            </span>
            <span className="gcard-elname">{el.label}</span>
            <span>
              <b>DEF</b> {card.defense}
            </span>
          </div>
        </div>
        {(card.rarity === "EPIQUE" || card.rarity === "LEGENDAIRE" || card.rarity === "MYTHIQUE" || card.shiny) && (
          <div className="gcard-holo" />
        )}
        {card.shiny && <div className="gcard-sparkles" aria-hidden />}
      </div>
      {badge && <span className="gcard-badge">{badge}</span>}
      {card.shiny && (
        <span className="shiny-badge" aria-label="Version brillante" title="Version brillante">
          ✦
        </span>
      )}
      {card.birthday && !badge && (
        <span className="gcard-badge birthday-badge" title="C'est son anniversaire aujourd'hui !">
          🎂 ANNIV
        </span>
      )}
      {(card.alt || card.event) && size !== "xs" && (
        <span className="gcard-tags">
          {card.alt && <span className="gcard-tag tag-alt" title="Version alternative">ALT</span>}
          {card.event && <span className="gcard-tag tag-event" title={`Carte d'événement : ${card.event}`}>✿ {card.event}</span>}
        </span>
      )}
      {count !== undefined && count > 1 && <span className="gcard-count">×{count}</span>}
    </div>
  );
}

export function CardBack({ size = "md", label }: { size?: "xs" | "sm" | "md" | "lg"; label?: string }) {
  return (
    <div className={`gcard gcard-${size} gcard-back`}>
      <div className="back-inner">
        <div className="back-emblem">
          <span>絆</span>
        </div>
        {label && <div className="back-label">{label}</div>}
      </div>
    </div>
  );
}
