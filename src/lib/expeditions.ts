import type { Element } from "@prisma/client";

export type Destination = { id: string; name: string; kanji: string; description: string; elements: [Element, Element] };

/** Destinations (3 sont proposées chaque jour). Chacune favorise deux éléments. */
export const DESTINATIONS: Destination[] = [
  { id: "volcan", name: "Volcan des braises", kanji: "炎", description: "Des coulées de lave et un ciel d'orage.", elements: ["FLAMME", "FOUDRE"] },
  { id: "cote", name: "Côte des brumes", kanji: "霞", description: "Une crique perdue dans le brouillard.", elements: ["EAU", "BRUME"] },
  { id: "sanctuaire", name: "Sanctuaire fleuri", kanji: "花", description: "Un temple oublié couvert de cerisiers.", elements: ["FLEUR", "VENT"] },
  { id: "mine", name: "Mine abandonnée", kanji: "岩", description: "Des galeries sombres pleines d'échos.", elements: ["PIERRE", "OMBRE"] },
  { id: "pics", name: "Pics venteux", kanji: "風", description: "Des sommets où le vent ne s'arrête jamais.", elements: ["VENT", "FOUDRE"] },
  { id: "foret", name: "Forêt de la lune", kanji: "月", description: "Les arbres y murmurent la nuit.", elements: ["OMBRE", "FLEUR"] },
  { id: "lac", name: "Lac gelé", kanji: "氷", description: "Une glace si claire qu'on y voit le ciel.", elements: ["EAU", "PIERRE"] },
  { id: "marche", name: "Marché de nuit", kanji: "市", description: "Lanternes, échoppes et bonnes affaires.", elements: ["FLAMME", "BRUME"] },
];
export const DEST_BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]));

export const EXPEDITION_TEAM = 3;
/** Expéditions en cours en même temps. */
export const EXPEDITION_SLOTS = 1;

export type Duration = { hours: number; label: string; coins: number; cardChance: number; boosterChance: number };
/** Gains volontairement modestes : environ 400 à 500 pièces par semaine pour un joueur assidu. */
export const DURATIONS: Duration[] = [
  { hours: 4, label: "Courte", coins: 8, cardChance: 0.08, boosterChance: 0.02 },
  { hours: 8, label: "Moyenne", coins: 18, cardChance: 0.18, boosterChance: 0.05 },
  { hours: 12, label: "Longue", coins: 30, cardChance: 0.32, boosterChance: 0.08 },
];

/** Les 3 destinations du jour (heure de Paris), les mêmes pour tout le monde. */
export function destinationsOfDay(now = new Date()): Destination[] {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  let h = 2166136261;
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const pool = [...DESTINATIONS];
  const out: Destination[] = [];
  while (out.length < 3) {
    h = (Math.imul(h ^ (h >>> 13), 1597334677) + 0x9e3779b9) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}

/**
 * Bonus de l'équipe : +15 % par carte du bon élément, +5 % par étoile d'évolution au-dessus de ★1
 * (moyenne de l'équipe). Entre ×1 et environ ×1,75.
 */
export function teamFactor(cards: { element: Element; level?: number }[], dest: Destination) {
  const match = cards.filter((c) => dest.elements.includes(c.element)).length;
  const lvl = cards.reduce((s, c) => s + ((c.level ?? 1) - 1), 0) / Math.max(1, cards.length);
  return Math.round((1 + 0.15 * match + 0.05 * lvl) * 100) / 100;
}

export type ExpeditionReward = { coins: number; cardId: string | null; shiny: boolean; booster: boolean; factor: number };
