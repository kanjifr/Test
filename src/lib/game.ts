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

export const RARITY_ORDER: Rarity[] = ["COMMUNE", "RARE", "EPIQUE", "LEGENDAIRE"];

export const RARITIES: Record<
  Rarity,
  { label: string; kanji: string; weight: number; color: string }
> = {
  COMMUNE: { label: "Commune", kanji: "並", weight: 64, color: "#9aa3ad" },
  RARE: { label: "Rare", kanji: "稀", weight: 25, color: "#3b9cff" },
  EPIQUE: { label: "Épique", kanji: "極", weight: 9, color: "#b25cff" },
  LEGENDAIRE: { label: "Légendaire", kanji: "伝", weight: 2, color: "#ffc23d" },
};

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
};

/** Tirage pondéré d'une rareté. `minRarity` permet de garantir une carte rare+. */
export function rollRarity(rand: () => number, minRarity: Rarity = "COMMUNE"): Rarity {
  const pool = RARITY_ORDER.slice(RARITY_ORDER.indexOf(minRarity));
  const total = pool.reduce((s, r) => s + RARITIES[r].weight, 0);
  let x = rand() * total;
  for (const r of pool) {
    x -= RARITIES[r].weight;
    if (x < 0) return r;
  }
  return pool[pool.length - 1];
}

/**
 * Tire `size` cartes. La dernière carte est au minimum Rare.
 * Si aucune carte n'existe dans la rareté tirée, on descend (puis monte) jusqu'à en trouver.
 */
export function drawPack<T extends { rarity: Rarity }>(
  cards: T[],
  size: number,
  rand: () => number,
): T[] {
  if (cards.length === 0) return [];
  const byRarity = new Map<Rarity, T[]>();
  for (const c of cards) {
    const list = byRarity.get(c.rarity) ?? [];
    list.push(c);
    byRarity.set(c.rarity, list);
  }
  const pick = (wanted: Rarity): T => {
    const i = RARITY_ORDER.indexOf(wanted);
    const search = [
      ...RARITY_ORDER.slice(0, i + 1).reverse(),
      ...RARITY_ORDER.slice(i + 1),
    ];
    for (const r of search) {
      const list = byRarity.get(r);
      if (list?.length) return list[Math.floor(rand() * list.length)];
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
