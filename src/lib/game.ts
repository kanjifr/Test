import type { Element, Rarity } from "@prisma/client";

export const SITE_NAME = process.env.SITE_NAME || "Kizuna";

export const PACK_SIZE = clampInt(process.env.PACK_SIZE, 5, 1, 10);
export const PACK_COOLDOWN_MS =
  Math.max(0, Number(process.env.PACK_COOLDOWN_HOURS ?? 4) || 0) * 3600_000;

function clampInt(v: string | undefined, def: number, min: number, max: number) {
  const n = Number.parseInt(v ?? "", 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export const RARITY_ORDER: Rarity[] = ["COMMUNE", "RARE", "EPIQUE", "LEGENDAIRE", "MYTHIQUE"];

export const RARITIES: Record<
  Rarity,
  { label: string; kanji: string; weight: number; color: string }
> = {
  COMMUNE: { label: "Commune", kanji: "並", weight: 64, color: "#9aa3ad" },
  RARE: { label: "Rare", kanji: "稀", weight: 25, color: "#3b9cff" },
  EPIQUE: { label: "Épique", kanji: "極", weight: 9, color: "#b25cff" },
  LEGENDAIRE: { label: "Légendaire", kanji: "伝", weight: 2, color: "#ffc23d" },
  // Jamais tirée par les poids : elle passe uniquement par le système de pity ci-dessous
  MYTHIQUE: { label: "Mythique", kanji: "神", weight: 0, color: "#ff2e63" },
};

/** Raretés tirées carte par carte (toutes sauf Mythique). */
export const SLOT_RARITIES = RARITY_ORDER.filter((r) => RARITIES[r].weight > 0);

/** Chance qu'une carte tirée soit une version brillante (shiny), quelle que soit sa rareté. */
export const SHINY_CHANCE = Math.min(1, Math.max(0, Number(process.env.SHINY_CHANCE ?? 0.02) || 0));

/** Nombre de doublons à recycler pour gagner un booster bonus. */
export const RECYCLE_COST = clampInt(process.env.RECYCLE_COST, 10, 1, 1000);

// --- Système de pity pour les cartes Mythiques ---
// Chance par booster, augmentée à partir de PITY_SOFT, garantie au PITY_HARD-ième booster.
export const MYTHIC_BASE_CHANCE = Math.min(1, Math.max(0, Number(process.env.MYTHIC_CHANCE ?? 0.004) || 0));
export const PITY_HARD = clampInt(process.env.PITY_HARD, 140, 2, 1000);
export const PITY_SOFT = Math.min(PITY_HARD - 1, clampInt(process.env.PITY_SOFT, 110, 1, 1000));

/** Chance d'obtenir une Mythique dans le prochain booster, selon le nombre de boosters déjà ouverts sans en avoir. */
export function mythicChance(pityCount: number): number {
  const n = pityCount + 1; // numéro de ce booster depuis la dernière Mythique
  if (n >= PITY_HARD) return 1;
  if (n <= PITY_SOFT) return MYTHIC_BASE_CHANCE;
  const step = (1 - MYTHIC_BASE_CHANCE) / (PITY_HARD - PITY_SOFT);
  return Math.min(1, MYTHIC_BASE_CHANCE + (n - PITY_SOFT) * step);
}

export const ELEMENTS: Record<Element, { label: string; kanji: string; color: string }> = {
  EAU: { label: "Eau", kanji: "水", color: "#2f8fd8" },
  FLAMME: { label: "Flamme", kanji: "炎", color: "#e8532a" },
  FOUDRE: { label: "Foudre", kanji: "雷", color: "#f2c230" },
  VENT: { label: "Vent", kanji: "風", color: "#3fbf8f" },
  PIERRE: { label: "Pierre", kanji: "岩", color: "#9a7b5a" },
  BRUME: { label: "Brume", kanji: "霞", color: "#9fb4c7" },
  FLEUR: { label: "Fleur", kanji: "花", color: "#ef7fae" },
  OMBRE: { label: "Ombre", kanji: "影", color: "#7058a8" },
};

export const ELEMENT_KEYS = Object.keys(ELEMENTS) as Element[];

export type CardView = {
  id: string;
  number: number;
  name: string;
  title: string;
  description: string;
  rarity: Rarity;
  element: Element;
  attack: number;
  defense: number;
  imageUrl: string | null;
  videoUrl: string | null;
  /** Le membre représenté fête son anniversaire aujourd'hui */
  birthday?: boolean;
  /** Version brillante (shiny) */
  shiny?: boolean;
  /** Nom de l'événement (carte limitée dans le temps) */
  event?: string | null;
  /** Version alternative d'une autre carte */
  alt?: boolean;
};

/** Tirage pondéré d'une rareté. `minRarity` permet de garantir une carte rare+. */
export function rollRarity(rand: () => number, minRarity: Rarity = "COMMUNE"): Rarity {
  const pool = SLOT_RARITIES.slice(SLOT_RARITIES.indexOf(minRarity));
  const total = pool.reduce((s, r) => s + RARITIES[r].weight, 0);
  let x = rand() * total;
  for (const r of pool) {
    x -= RARITIES[r].weight;
    if (x < 0) return r;
  }
  return pool[pool.length - 1];
}

/**
 * Tire `size` cartes (jamais de Mythique, voir `mythicChance`). La dernière carte est au minimum Rare.
 * Si aucune carte n'existe dans la rareté tirée, on descend (puis monte) jusqu'à en trouver.
 */
/** Tirage pondéré dans une liste (poids 1 par défaut). */
function pickWeighted<T>(list: T[], rand: () => number, weightOf?: (c: T) => number): T {
  if (!weightOf) return list[Math.floor(rand() * list.length)];
  const total = list.reduce((s, c) => s + Math.max(0, weightOf(c)), 0);
  let x = rand() * total;
  for (const c of list) {
    x -= Math.max(0, weightOf(c));
    if (x < 0) return c;
  }
  return list[list.length - 1];
}

export function drawPack<T extends { rarity: Rarity }>(
  cards: T[],
  size: number,
  rand: () => number,
  /** Poids d'une carte à l'intérieur de sa rareté (ex. carte d'anniversaire ×5) */
  weightOf?: (c: T) => number,
): T[] {
  const pool = cards.filter((c) => RARITIES[c.rarity].weight > 0);
  if (pool.length === 0) return [];
  const byRarity = new Map<Rarity, T[]>();
  for (const c of pool) {
    const list = byRarity.get(c.rarity) ?? [];
    list.push(c);
    byRarity.set(c.rarity, list);
  }
  const pick = (wanted: Rarity): T => {
    const i = SLOT_RARITIES.indexOf(wanted);
    const search = [
      ...SLOT_RARITIES.slice(0, i + 1).reverse(),
      ...SLOT_RARITIES.slice(i + 1),
    ];
    for (const r of search) {
      const list = byRarity.get(r);
      if (list?.length) return pickWeighted(list, rand, weightOf);
    }
    throw new Error("unreachable");
  };
  const result: T[] = [];
  for (let i = 0; i < size; i++) {
    const guaranteed = i === size - 1 && size > 1;
    result.push(pick(rollRarity(rand, guaranteed ? "RARE" : "COMMUNE")));
  }
  // Les plus rares à la fin pour le suspense
  return result.sort(
    (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity),
  );
}

const byRarityOrder = <T extends { rarity: Rarity }>(a: T, b: T) =>
  RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);

/**
 * Tirage complet d'un booster, pity compris.
 * En cas de Mythique, elle remplace la carte la plus commune et arrive en dernier.
 * Le compteur de pity ne bouge pas tant qu'aucune carte Mythique n'existe.
 */
export function drawBooster<T extends { rarity: Rarity }>(
  cards: T[],
  size: number,
  pityCount: number,
  rand: () => number,
  weightOf?: (c: T) => number,
): { cards: T[]; mythic: boolean; pityCount: number } {
  const mythics = cards.filter((c) => c.rarity === "MYTHIQUE");
  const drawn = drawPack(cards, size, rand, weightOf);
  if (mythics.length === 0) return { cards: drawn, mythic: false, pityCount };
  const hit = rand() < mythicChance(pityCount);
  if (hit) {
    const m = pickWeighted(mythics, rand, weightOf);
    if (drawn.length > 0) drawn[0] = m;
    else drawn.push(m);
    drawn.sort(byRarityOrder);
  }
  return { cards: drawn, mythic: hit, pityCount: hit ? 0 : pityCount + 1 };
}
