import type { Prisma, Rarity } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

/** Ajoute (ou retire, montant négatif) des pièces et garde une trace dans l'historique. */
export async function addCoins(db: Db, userId: string, amount: number, reason: string) {
  if (!amount) return;
  await db.user.update({ where: { id: userId }, data: { coins: { increment: amount } } });
  await db.coinLog.create({ data: { userId, amount, reason: reason.slice(0, 120) } });
}

/** Retire des pièces seulement si le membre en a assez (sans risque de double achat). */
export async function spendCoins(db: Db, userId: string, amount: number, reason: string) {
  const done = await db.user.updateMany({ where: { id: userId, coins: { gte: amount } }, data: { coins: { decrement: amount } } });
  if (done.count === 0) return false;
  await db.coinLog.create({ data: { userId, amount: -amount, reason: reason.slice(0, 120) } });
  return true;
}

export type ShopConfig = {
  /** Prix d'un booster */
  booster: number;
  /** Boosters achetables par semaine */
  boostersPerWeek: number;
  /** Prix d'une carte précise selon sa rareté (les Mythiques ne sont pas en vente) */
  prices: Record<Exclude<Rarity, "MYTHIQUE">, number>;
  /** Gains */
  duelWin: number;
  duelLoss: number;
  quest: number;
  tournamentPlay: number;
  tournamentFinal: number;
  tournamentWin: number;
  season: [number, number, number];
};

/**
 * Économie volontairement lente : un joueur actif gagne environ 500 à 600 pièces par semaine
 * (duels + quêtes), soit une Commune par semaine, une Légendaire en 2 à 3 mois.
 */
export const DEFAULT_SHOP: ShopConfig = {
  booster: 400,
  boostersPerWeek: 3,
  prices: { COMMUNE: 500, RARE: 1000, EPIQUE: 2500, LEGENDAIRE: 6000 },
  duelWin: 10,
  duelLoss: 2,
  quest: 60,
  tournamentPlay: 25,
  tournamentFinal: 150,
  tournamentWin: 300,
  season: [500, 300, 150],
};

const n = (v: unknown, d: number, max = 1_000_000) => {
  const x = Math.floor(Number(v));
  return Number.isFinite(x) ? Math.min(max, Math.max(0, x)) : d;
};

export function sanitizeShop(raw: Partial<ShopConfig> | null | undefined): ShopConfig {
  const r = raw ?? {};
  const p = (r.prices ?? {}) as Partial<ShopConfig["prices"]>;
  const s = Array.isArray(r.season) ? r.season : [];
  const d = DEFAULT_SHOP;
  return {
    booster: n(r.booster, d.booster),
    boostersPerWeek: n(r.boostersPerWeek, d.boostersPerWeek, 100),
    prices: {
      COMMUNE: n(p.COMMUNE, d.prices.COMMUNE),
      RARE: n(p.RARE, d.prices.RARE),
      EPIQUE: n(p.EPIQUE, d.prices.EPIQUE),
      LEGENDAIRE: n(p.LEGENDAIRE, d.prices.LEGENDAIRE),
    },
    duelWin: n(r.duelWin, d.duelWin, 10_000),
    duelLoss: n(r.duelLoss, d.duelLoss, 10_000),
    quest: n(r.quest, d.quest, 10_000),
    tournamentPlay: n(r.tournamentPlay, d.tournamentPlay, 100_000),
    tournamentFinal: n(r.tournamentFinal, d.tournamentFinal, 100_000),
    tournamentWin: n(r.tournamentWin, d.tournamentWin, 100_000),
    season: [n(s[0], d.season[0]), n(s[1], d.season[1]), n(s[2], d.season[2])],
  };
}

export async function getShopConfig(): Promise<ShopConfig> {
  const row = await prisma.setting.findUnique({ where: { key: "shop" } });
  try {
    return sanitizeShop(row ? JSON.parse(row.value) : null);
  } catch {
    return DEFAULT_SHOP;
  }
}

export async function setShopConfig(c: ShopConfig) {
  const value = JSON.stringify(sanitizeShop(c));
  await prisma.setting.upsert({ where: { key: "shop" }, create: { key: "shop", value }, update: { value } });
}

export const fmtCoins = (n: number) => n.toLocaleString("fr-FR");
