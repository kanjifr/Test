import { prisma } from "@/lib/prisma";

/** Boosters bonus offerts pour recommencer après un prestige. */
export const PRESTIGE_REWARD = 3;

/**
 * Cartes à posséder pour le prestige : toutes les cartes actives, sauf les cartes d'événement
 * (limitées dans le temps, elles ne doivent pas bloquer les nouveaux venus).
 */
const targetWhere = { active: true, eventName: null } as const;

export async function prestigeProgress(userId: string) {
  const [total, owned] = await Promise.all([
    prisma.card.count({ where: targetWhere }),
    prisma.userCard.count({ where: { userId, card: targetWhere } }),
  ]);
  return { total, owned, ready: total > 0 && owned >= total };
}
