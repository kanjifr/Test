/** Niveau maximum d'une carte (★5). */
export const MAX_LEVEL = 5;
/** Bonus d'ATK et de DEF par étoile au-dessus de ★1 (+5 % par niveau, +20 % à ★5). */
export const LEVEL_BONUS = 0.05;

/** Doublons à fusionner pour passer du niveau `level` au suivant : 1, 2, 3 puis 4 (10 au total). */
export const levelCost = (level: number) => Math.max(1, Math.min(MAX_LEVEL - 1, level));

/** Doublons nécessaires pour aller de ★1 au niveau donné. */
export const totalCostTo = (level: number) => {
  let n = 0;
  for (let l = 1; l < level; l++) n += levelCost(l);
  return n;
};

export const clampLevel = (level: number | null | undefined) => Math.min(MAX_LEVEL, Math.max(1, Math.floor(level ?? 1)));

/** Statistique avec le bonus de niveau. */
export const boosted = (stat: number, level: number | null | undefined) => Math.round(stat * (1 + LEVEL_BONUS * (clampLevel(level) - 1)));

export const stars = (level: number) => "★".repeat(clampLevel(level)) + "☆".repeat(MAX_LEVEL - clampLevel(level));
