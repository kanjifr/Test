import { prisma } from "@/lib/prisma";

/** Cartes d'un membre actuellement en expédition (elles ne peuvent pas attaquer). */
export async function cardsAway(userId: string): Promise<Set<string>> {
  const active = await prisma.expedition.findMany({ where: { userId, claimedAt: null }, select: { cardIds: true } });
  return new Set(active.flatMap((e) => e.cardIds));
}
