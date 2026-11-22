import type { Rarity } from "@prisma/client";
import { rollRarity, RARITIES, type CardView } from "@/lib/game";
import { power } from "@/lib/duel";

export const ARENA_PICKS = 5;
export const ARENA_TEAM = 3;
export const ARENA_MAX_WINS = 7;
export const ARENA_MAX_LOSSES = 3;
/** Prix d'une partie supplémentaire (la première du jour est gratuite). */
export const ARENA_ENTRY_COST = 100;

export type ArenaReward = { coins: number; boosters: number; card: Rarity | null };
/** Récompense selon le nombre de victoires (0 à 7). */
export const ARENA_REWARDS: ArenaReward[] = [
  { coins: 10, boosters: 0, card: null },
  { coins: 20, boosters: 0, card: null },
  { coins: 35, boosters: 0, card: null },
  { coins: 50, boosters: 0, card: null },
  { coins: 70, boosters: 1, card: null },
  { coins: 90, boosters: 1, card: null },
  { coins: 120, boosters: 1, card: "RARE" },
  { coins: 150, boosters: 2, card: "EPIQUE" },
];

export const rewardLabel = (r: ArenaReward) =>
  [`🪙 ${r.coins}`, r.boosters ? `🎁 ${r.boosters} booster${r.boosters > 1 ? "s" : ""}` : "", r.card ? `🃏 carte ${RARITIES[r.card].label}+` : ""].filter(Boolean).join(" · ");

type Pool = (CardView & { exclusive?: boolean })[];

/**
 * 3 cartes proposées : une rareté tirée pour chacune (les rares sont plus rares),
 * jamais deux fois la même carte ni une carte déjà choisie.
 */
export function arenaOffer(pool: Pool, exclude: Set<string>, rand: () => number): CardView[] {
  const out: CardView[] = [];
  const taken = new Set(exclude);
  for (let tries = 0; out.length < 3 && tries < 60; tries++) {
    const r: Rarity = rand() < 0.02 ? "MYTHIQUE" : rollRarity(rand);
    const list = pool.filter((c) => c.rarity === r && !taken.has(c.id));
    const fallback = pool.filter((c) => !taken.has(c.id));
    const from = list.length ? list : fallback;
    if (!from.length) break;
    const c = from[Math.floor(rand() * from.length)];
    taken.add(c.id);
    out.push(c);
  }
  return out;
}

/** Équipe adverse : de plus en plus forte à chaque victoire. */
export function arenaOpponent(pool: Pool, wins: number, rand: () => number): CardView[] {
  const sorted = [...pool].sort((a, b) => power(a) - power(b));
  // Position visée dans le classement des cartes : du milieu-bas vers le haut
  const target = Math.min(0.95, 0.3 + wins * 0.09);
  const out: CardView[] = [];
  const used = new Set<string>();
  for (let i = 0; i < 3 && used.size < sorted.length; i++) {
    const jitter = (rand() - 0.5) * 0.25;
    let idx = Math.round(Math.min(1, Math.max(0, target + jitter)) * (sorted.length - 1));
    while (used.has(sorted[idx].id)) idx = (idx + 1) % sorted.length;
    used.add(sorted[idx].id);
    out.push(sorted[idx]);
  }
  return out;
}

export const OPPONENT_NAMES = ["Recrue du dojo", "Apprenti", "Garde du temple", "Rōnin errant", "Vétéran", "Maître d'armes", "Champion de l'arène", "Légende vivante"];
