import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Retire `qty` exemplaires d'une carte, normaux ou brillants, en une seule requête (aucun
 * risque de concurrence). Avec `keepOne`, le membre garde toujours au moins un exemplaire.
 * Retourne false si le membre n'en a pas assez.
 */
export async function takeCopies(tx: Tx, userId: string, cardId: string, qty: number, shiny: boolean, keepOne = false) {
  const minLeft = keepOne ? 1 : 0;
  const changed = shiny
    ? await tx.$executeRaw`UPDATE "UserCard" SET "count" = "count" - ${qty}, "shiny" = "shiny" - ${qty}
        WHERE "userId" = ${userId} AND "cardId" = ${cardId} AND "shiny" >= ${qty} AND "count" - ${qty} >= ${minLeft}`
    : await tx.$executeRaw`UPDATE "UserCard" SET "count" = "count" - ${qty}
        WHERE "userId" = ${userId} AND "cardId" = ${cardId} AND "count" - "shiny" >= ${qty} AND "count" - ${qty} >= ${minLeft}`;
  if (changed === 0) return false;
  // La carte quitte la collection s'il n'en reste plus
  await tx.userCard.deleteMany({ where: { userId, cardId, count: { lte: 0 } } });
  return true;
}

export async function giveCopies(tx: Tx, userId: string, cardId: string, qty: number, shiny: boolean) {
  return tx.userCard.upsert({
    where: { userId_cardId: { userId, cardId } },
    create: { userId, cardId, count: qty, shiny: shiny ? qty : 0 },
    update: { count: { increment: qty }, ...(shiny ? { shiny: { increment: qty } } : {}) },
  });
}
