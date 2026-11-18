import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const TRADE_EXPIRY_MS = 48 * 3600_000;
export const MAX_PENDING_SENT = 5;
export const MAX_ITEMS_PER_SIDE = 10;

/** Marque comme expirées les propositions de plus de 48 h. */
export async function expireTrades() {
  await prisma.trade.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED", resolvedAt: new Date() },
  });
}

export async function pendingIncomingCount(userId: string) {
  return prisma.trade.count({
    where: { toId: userId, status: "PENDING", expiresAt: { gt: new Date() } },
  });
}

export const tradeInclude = {
  from: { select: { id: true, name: true, image: true } },
  to: { select: { id: true, name: true, image: true } },
  items: { include: { card: { include: { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } } } } },
} satisfies Prisma.TradeInclude;

export type TradeWithItems = Prisma.TradeGetPayload<{ include: typeof tradeInclude }>;

/** Cartes échangeables d'un membre : tous les exemplaires qu'il possède. */
export async function tradableCards(userId: string) {
  const owned = await prisma.userCard.findMany({
    where: { userId, count: { gte: 1 }, card: { active: true } },
    include: { card: { include: { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } } } },
    orderBy: { card: { number: "asc" } },
  });
  // Les exemplaires normaux et brillants sont proposés séparément
  return owned.flatMap((o) => [
    ...(o.count - o.shiny > 0 ? [{ card: o.card, available: o.count - o.shiny, total: o.count, shiny: false }] : []),
    ...(o.shiny > 0 ? [{ card: o.card, available: o.shiny, total: o.count, shiny: true }] : []),
  ]);
}
