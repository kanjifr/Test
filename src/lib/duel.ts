/**
 * Moteur de duel : 3 manches, carte contre carte, au tour par tour.
 * Fichier autonome (aucun import) pour pouvoir être testé seul.
 */

export type Fighter = {
  id: string;
  number: number;
  name: string;
  title: string;
  description: string;
  rarity: string;
  element: string;
  attack: number;
  defense: number;
  imageUrl: string | null;
  videoUrl: string | null;
};

export type Effect = "super" | "weak" | "normal";
export type Hit = { from: 0 | 1; dmg: number; crit: boolean; dodge: boolean; effect: Effect; hp: [number, number] };
export type Round = { fighters: [Fighter, Fighter]; hpMax: [number, number]; first: 0 | 1; hits: Hit[]; winner: 0 | 1 | -1 };
export type DuelLog = { version: 1; rounds: Round[]; score: [number, number]; winner: 0 | 1 | -1 };

/**
 * Avantages élémentaires (×1,3 contre l'élément suivant, ×0,8 contre le précédent) :
 * Eau → Flamme → Fleur → Pierre → Foudre → Eau, et Vent → Brume → Ombre → Vent.
 */
export const BEATS: Record<string, string> = {
  EAU: "FLAMME",
  FLAMME: "FLEUR",
  FLEUR: "PIERRE",
  PIERRE: "FOUDRE",
  FOUDRE: "EAU",
  VENT: "BRUME",
  BRUME: "OMBRE",
  OMBRE: "VENT",
};
export const WHY: Record<string, string> = {
  EAU: "L'eau éteint la flamme",
  FLAMME: "La flamme brûle les fleurs",
  FLEUR: "Les racines fendent la pierre",
  PIERRE: "La pierre arrête la foudre",
  FOUDRE: "La foudre électrise l'eau",
  VENT: "Le vent disperse la brume",
  BRUME: "La brume engloutit l'ombre",
  OMBRE: "L'ombre étouffe le vent",
};

export const SUPER = 1.3;
export const WEAK = 0.8;
export const CRIT_CHANCE = 0.15;
export const CRIT_MULT = 1.8;
export const DODGE_CHANCE = 0.12;
const MAX_HITS = 24;

export function effectOf(attacker: string, defender: string): Effect {
  if (BEATS[attacker] === defender) return "super";
  if (BEATS[defender] === attacker) return "weak";
  return "normal";
}

export const maxHp = (f: Pick<Fighter, "defense">) => 100 + Math.round(Math.max(0, f.defense) * 0.2);

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dégâts d'un coup : l'attaque, l'élément et le hasard augmentent, la défense réduit. */
export function damage(att: Fighter, def: Fighter, rand: () => number) {
  const effect = effectOf(att.element, def.element);
  if (rand() < DODGE_CHANCE) return { dmg: 0, crit: false, dodge: true, effect };
  const mult = effect === "super" ? SUPER : effect === "weak" ? WEAK : 1;
  const crit = rand() < CRIT_CHANCE;
  // Les écarts de stats comptent, mais sans écraser le hasard (racine carrée)
  const atk = 15 + Math.sqrt(Math.max(0, att.attack)) * 8;
  const base = atk * mult * (0.7 + rand() * 0.6) * (crit ? CRIT_MULT : 1);
  const dmg = Math.max(1, Math.round((base * 50) / (50 + Math.sqrt(Math.max(0, def.defense)) * 5)));
  return { dmg, crit, dodge: false, effect };
}

export function fightRound(a: Fighter, b: Fighter, rand: () => number): Round {
  const hpMax: [number, number] = [maxHp(a), maxHp(b)];
  const hp: [number, number] = [...hpMax];
  // La carte la plus offensive a plus de chances de frapper en premier
  const pFirstA = Math.min(0.8, Math.max(0.2, 0.5 + (a.attack - b.attack) / 400));
  const first: 0 | 1 = rand() < pFirstA ? 0 : 1;
  const hits: Hit[] = [];
  let turn: 0 | 1 = first;
  while (hp[0] > 0 && hp[1] > 0 && hits.length < MAX_HITS) {
    const att = turn === 0 ? a : b;
    const def = turn === 0 ? b : a;
    const target = turn === 0 ? 1 : 0;
    const { dmg, crit, dodge, effect } = damage(att, def, rand);
    hp[target] = Math.max(0, hp[target] - dmg);
    hits.push({ from: turn, dmg, crit, dodge, effect, hp: [hp[0], hp[1]] });
    turn = turn === 0 ? 1 : 0;
  }
  let winner: 0 | 1 | -1;
  if (hp[1] <= 0) winner = 0;
  else if (hp[0] <= 0) winner = 1;
  else {
    // Temps écoulé : la carte qui garde le plus de vie (en %) l'emporte
    const ra = hp[0] / hpMax[0];
    const rb = hp[1] / hpMax[1];
    winner = Math.abs(ra - rb) < 1e-9 ? -1 : ra > rb ? 0 : 1;
  }
  return { fighters: [a, b], hpMax, first, hits, winner };
}

/** Duel complet entre deux équipes de 3 cartes (même ordre que choisi par les joueurs). */
export function simulateDuel(teamA: Fighter[], teamB: Fighter[], seed: number): DuelLog {
  const rand = rng(seed);
  const rounds: Round[] = [];
  const score: [number, number] = [0, 0];
  for (let i = 0; i < Math.min(teamA.length, teamB.length); i++) {
    const r = fightRound(teamA[i], teamB[i], rand);
    if (r.winner !== -1) score[r.winner]++;
    rounds.push(r);
  }
  const winner = score[0] === score[1] ? -1 : score[0] > score[1] ? 0 : 1;
  return { version: 1, rounds, score, winner };
}

export const power = (f: Pick<Fighter, "attack" | "defense">) => f.attack + f.defense;
