import { TIERS, type BadgeView } from "@/lib/achievements";

export function Badge({
  badge,
  size = "md",
  locked = false,
}: {
  badge: BadgeView;
  size?: "sm" | "md" | "lg";
  locked?: boolean;
}) {
  return (
    <span
      className={`badge badge-${size} ${locked ? "locked" : ""}`}
      style={{ "--tc": TIERS[badge.tier].color } as React.CSSProperties}
      title={`${badge.name} : ${badge.description}`}
    >
      {badge.kanji}
    </span>
  );
}

/** Pseudo suivi du badge mis en avant. */
export function NameWithBadge({ name, badge }: { name: string | null; badge: BadgeView | null }) {
  return (
    <span className="name-badge">
      {name}
      {badge && <Badge badge={badge} size="sm" />}
    </span>
  );
}
