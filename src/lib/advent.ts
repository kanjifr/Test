import type { Rarity } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RARITIES, RARITY_ORDER } from "@/lib/game";

export type AdventReward =
  | { kind: "boosters"; n: number }
  | { kind: "coins"; n: number }
  | { kind: "card"; rarity: Rarity }
  | { kind: "shiny"; rarity: Rarity }
  | { kind: "pity"; n: number }
  | { kind: "xmas"; rarity: Rarity | null; boosters: number };

export type AdventConfig = {
  /** Nom d'événement des cartes de Noël exclusives (champ « Carte d'événement » de l'admin) */
  eventName: string;
  /** Cases à avoir ouvertes (celle du 24 comprise) pour le grand cadeau */
  grandMin: number;
  days: AdventReward[];
};

const b = (n: number): AdventReward => ({ kind: "boosters", n });
const c = (n: number): AdventReward => ({ kind: "coins", n });

export const DEFAULT_ADVENT: AdventConfig = {
  eventName: "Noël",
  grandMin: 15,
  days: [
    b(1), c(100), { kind: "card", rarity: "RARE" }, b(1), c(100), b(2), b(1), { kind: "shiny", rarity: "COMMUNE" },
    c(150), { kind: "card", rarity: "RARE" }, b(1), { kind: "pity", n: 10 }, b(1), c(150), { kind: "shiny", rarity: "COMMUNE" }, b(1),
    { kind: "card", rarity: "EPIQUE" }, { kind: "xmas", rarity: null, boosters: 0 }, c(200), b(1), { kind: "xmas", rarity: null, boosters: 0 },
    { kind: "shiny", rarity: "RARE" }, b(2), { kind: "xmas", rarity: "LEGENDAIRE", boosters: 3 },
  ],
};

export const KIND_LABELS: Record<AdventReward["kind"], string> = {
  boosters: "Boosters bonus",
  coins: "Pièces",
  card: "Carte au hasard (rareté minimum)",
  shiny: "Carte brillante au hasard (rareté minimum)",
  pity: "Avance de la jauge Mythique",
  xmas: "Carte de Noël exclusive (+ boosters)",
};

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`;

/** Description courte d'un cadeau (pour l'admin et le récapitulatif). */
export function rewardText(r: AdventReward): string {
  switch (r.kind) {
    case "boosters":
      return `🎁 ${plural(r.n, "booster")} bonus`;
    case "coins":
      return `🪙 ${r.n} pièces`;
    case "card":
      return `🃏 Une carte ${RARITIES[r.rarity].label} ou mieux`;
    case "shiny":
      return `✦ Une carte brillante (${RARITIES[r.rarity].label} ou mieux)`;
    case "pity":
      return `⏩ Jauge Mythique +${r.n}`;
    case "xmas":
      return `🎄 Une carte de Noël${r.rarity ? ` ${RARITIES[r.rarity].label}` : ""}${r.boosters ? ` + ${plural(r.boosters, "booster")}` : ""}`;
  }
}

const isRarity = (v: unknown): v is Rarity => typeof v === "string" && (RARITY_ORDER as string[]).includes(v);
const int = (v: unknown, min: number, max: number, d: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

/** Vérifie un cadeau venant de la base ou d'un formulaire. */
export function sanitizeReward(raw: unknown, fallback: AdventReward): AdventReward {
  const r = (raw ?? {}) as Record<string, unknown>;
  switch (r.kind) {
    case "boosters":
      return { kind: "boosters", n: int(r.n, 1, 10, 1) };
    case "coins":
      return { kind: "coins", n: int(r.n, 1, 5000, 100) };
    case "pity":
      return { kind: "pity", n: int(r.n, 1, 50, 10) };
    case "card":
    case "shiny":
      return { kind: r.kind, rarity: isRarity(r.rarity) && r.rarity !== "MYTHIQUE" ? r.rarity : "RARE" };
    case "xmas":
      return { kind: "xmas", rarity: isRarity(r.rarity) ? r.rarity : null, boosters: int(r.boosters, 0, 10, 0) };
    default:
      return fallback;
  }
}

export async function getAdventConfig(): Promise<AdventConfig> {
  const row = await prisma.setting.findUnique({ where: { key: "advent" } });
  let raw: Partial<AdventConfig> = {};
  try {
    raw = row ? JSON.parse(row.value) : {};
  } catch {}
  return {
    eventName: typeof raw.eventName === "string" && raw.eventName.trim() ? raw.eventName.trim().slice(0, 30) : DEFAULT_ADVENT.eventName,
    grandMin: int(raw.grandMin, 1, 24, DEFAULT_ADVENT.grandMin),
    days: DEFAULT_ADVENT.days.map((d, i) => sanitizeReward(raw.days?.[i], d)),
  };
}

export async function setAdventConfig(c: AdventConfig) {
  const value = JSON.stringify(c);
  await prisma.setting.upsert({ where: { key: "advent" }, create: { key: "advent", value }, update: { value } });
}

/**
 * Jour du calendrier aujourd'hui (1 à 24) à l'heure de Paris, sinon null.
 * En développement, ADVENT_DATE=AAAA-MM-JJ permet de tester.
 */
export function adventToday(now = new Date()): { year: number; day: number | null; month: number; date: number } {
  const forced = process.env.NODE_ENV !== "production" ? process.env.ADVENT_DATE : undefined;
  const iso = forced && /^\d{4}-\d{2}-\d{2}$/.test(forced)
    ? forced
    : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [year, month, date] = iso.split("-").map(Number);
  return { year, month, date, day: month === 12 && date <= 24 ? date : null };
}

/** Le calendrier s'affiche du 1er au 26 décembre (récapitulatif après le 24). */
export const adventVisible = (t = adventToday()) => t.month === 12 && t.date <= 26;

/** Ordre des cases sur la grille, mélangé comme un vrai calendrier (le même chaque année). */
export const GRID_ORDER = [7, 18, 3, 12, 22, 1, 15, 9, 20, 5, 24, 11, 2, 16, 8, 19, 13, 4, 23, 10, 6, 17, 21, 14];
