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
  items: { include: { card: { include: { subject: { select: { image: true, consent: true } } } } } },
} satisfies Prisma.TradeInclude;

export type TradeWithItems = Prisma.TradeGetPayload<{ include: typeof tradeInclude }>;

/** Doublons échangeables d'un membre : exemplaires possédés moins un. */
export async function tradableCards(userId: string) {
  const owned = await prisma.userCard.findMany({
    where: { userId, count: { gte: 2 }, card: { active: true } },
    include: { card: { include: { subject: { select: { image: true, consent: true } } } } },
    orderBy: { card: { number: "asc" } },
  });
  return owned.map((o) => ({ card: o.card, available: o.count - 1 }));
}
