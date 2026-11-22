import type { Card, Prisma } from "@prisma/client";
import type { ShopConfig } from "@/lib/coins";
import { boosterWhere } from "@/lib/series";

/** Une version alternative coûte 50 % de plus. */
export const ALT_PRICE_MULT = 1.5;

/**
 * Cartes en vente : celles qui peuvent sortir des boosters, sauf les Mythiques
 * et les cartes d'événement (elles gardent leur valeur).
 */
export function shopCardWhere(): Prisma.CardWhereInput {
  return { AND: [boosterWhere(), { eventName: null, rarity: { not: "MYTHIQUE" } }] };
}

export function cardPrice(card: Pick<Card, "rarity" | "variantOfId">, shop: ShopConfig) {
  if (card.rarity === "MYTHIQUE") return Infinity;
  const base = shop.prices[card.rarity];
  return Math.round(card.variantOfId ? base * ALT_PRICE_MULT : base);
}
