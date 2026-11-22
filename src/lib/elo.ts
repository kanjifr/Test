/**
 * Classement Elo des duels.
 * Battre beaucoup plus faible que soi ne rapporte presque rien, perdre contre lui coûte cher :
 * attaquer les plus faibles n'aide plus à monter.
 */
export const START_RATING = 1000;
/** Points en jeu pour l'attaquant (il choisit son adversaire)… */
export const K_ATTACK = 32;
/** … et pour le défenseur (il ne joue pas lui-même : il perd et gagne moins). */
export const K_DEFENSE = 16;
/** Duels à disputer dans le mois pour apparaître au classement de la saison. */
export const MIN_SEASON_DUELS = 5;
/** Une victoire doit rapporter au moins autant de points pour compter comme « victoire du jour » (booster bonus). */
export const REWARD_MIN_GAIN = 8;

/** Probabilité de victoire de A contre B selon leurs cotes. */
export const expected = (ra: number, rb: number) => 1 / (1 + 10 ** ((rb - ra) / 400));

/** Variation de cote (score : 1 victoire, 0,5 nul, 0 défaite). */
export const eloDelta = (ra: number, rb: number, score: number, k: number) => Math.round(k * (score - expected(ra, rb)));

/** Ce que l'attaquant gagne s'il bat l'adversaire, et ce qu'il perd s'il est battu. */
export function preview(attacker: number, defender: number) {
  return { win: Math.max(1, eloDelta(attacker, defender, 1, K_ATTACK)), loss: Math.min(-1, eloDelta(attacker, defender, 0, K_ATTACK)) };
}

/** Nouvelle saison : chacun se rapproche de 1000 (la moitié de l'écart est conservée). */
export const softReset = (r: number) => Math.round(START_RATING + (r - START_RATING) / 2);

export type Tier = { min: number; label: string; kanji: string; color: string };
export const TIERS_ELO: Tier[] = [
  { min: 0, label: "Bronze", kanji: "銅", color: "#cd8a52" },
  { min: 1100, label: "Argent", kanji: "銀", color: "#c9d3dd" },
  { min: 1250, label: "Or", kanji: "金", color: "#ffc23d" },
  { min: 1400, label: "Platine", kanji: "白", color: "#7fe0d0" },
  { min: 1550, label: "Diamant", kanji: "晶", color: "#7fb8ff" },
  { min: 1700, label: "Maître", kanji: "極", color: "#ff5fa2" },
];
export const tierOf = (r: number) => [...TIERS_ELO].reverse().find((t) => r >= t.min) ?? TIERS_ELO[0];

/** Pièces d'un duel : une victoire rapporte selon la difficulté (2× le gain de base contre beaucoup plus fort). */
export function duelCoins(won: boolean, attacker: number, defender: number, base: { win: number; loss: number }) {
  if (!won) return base.loss;
  const e = expected(attacker, defender);
  return Math.max(1, Math.min(base.win * 2, Math.round(base.win * 2 * (1 - e))));
}
