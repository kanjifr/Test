"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  expireTrades,
  MAX_ITEMS_PER_SIDE,
  MAX_PENDING_SENT,
  TRADE_EXPIRY_MS,
} from "@/lib/trades";
import { checkAchievements } from "@/lib/achievements-server";

type Line = { cardId: string; qty: number };
export type ProposeInput = { toId: string; offer: Line[]; request: Line[]; parentId?: string };
export type ActionResult = { ok: true } | { ok: false; error: string };

class TradeError extends Error {}

function clean(lines: unknown): Line[] {
  if (!Array.isArray(lines)) throw new TradeError("Proposition invalide.");
  const map = new Map<string, number>();
  for (const l of lines) {
    const cardId = String((l as Line)?.cardId ?? "");
    const qty = Math.floor(Number((l as Line)?.qty));
    if (!cardId || !Number.isFinite(qty) || qty < 1 || qty > 20) throw new TradeError("Proposition invalide.");
    map.set(cardId, (map.get(cardId) ?? 0) + qty);
  }
  if (map.size > MAX_ITEMS_PER_SIDE) throw new TradeError(`${MAX_ITEMS_PER_SIDE} cartes différentes maximum par côté.`);
  return [...map].map(([cardId, qty]) => ({ cardId, qty }));
}

/** Vérifie que `userId` possède assez d'exemplaires de chaque carte. */
async function checkOwned(userId: string, lines: Line[], who: "toi" | "lui") {
  if (lines.length === 0) return;
  const owned = await prisma.userCard.findMany({
    where: { userId, cardId: { in: lines.map((l) => l.cardId) }, card: { active: true } },
  });
  const counts = new Map(owned.map((o) => [o.cardId, o.count]));
  for (const l of lines) {
    if ((counts.get(l.cardId) ?? 0) < l.qty) {
      throw new TradeError(
        who === "toi"
          ? "Tu ne possèdes pas assez d'exemplaires de l'une des cartes proposées."
          : "Ce membre ne possède plus assez d'exemplaires de l'une des cartes demandées.",
      );
    }
  }
}

export async function proposeTrade(input: ProposeInput): Promise<ActionResult> {
  const me = await requireUser();
  try {
    await expireTrades();
    const toId = String(input?.toId ?? "");
    if (!toId || toId === me.id) throw new TradeError("Destinataire invalide.");
    const offer = clean(input.offer);
    const request = clean(input.request);
    if (offer.length === 0 || request.length === 0) {
      throw new TradeError("Choisis au moins une carte à donner et une carte à recevoir.");
    }

    const target = await prisma.user.findUnique({ where: { id: toId }, select: { id: true } });
    if (!target) throw new TradeError("Membre introuvable.");

    const pending = await prisma.trade.count({ where: { fromId: me.id, status: "PENDING" } });
    if (pending >= MAX_PENDING_SENT) {
      throw new TradeError(`Tu as déjà ${MAX_PENDING_SENT} propositions en attente. Annule-en une ou attends une réponse.`);
    }

    await checkOwned(me.id, offer, "toi");
    await checkOwned(toId, request, "lui");

    await prisma.$transaction(async (tx) => {
      if (input.parentId) {
        // Contre-proposition : la proposition d'origine doit m'être adressée par ce membre
        const closed = await tx.trade.updateMany({
          where: { id: input.parentId, toId: me.id, fromId: toId, status: "PENDING", expiresAt: { gt: new Date() } },
          data: { status: "COUNTERED", resolvedAt: new Date() },
        });
        if (closed.count === 0) throw new TradeError("La proposition d'origine n'est plus disponible.");
      }
      await tx.trade.create({
        data: {
          fromId: me.id,
          toId,
          parentId: input.parentId || null,
          expiresAt: new Date(Date.now() + TRADE_EXPIRY_MS),
          items: {
            create: [
              ...offer.map((l) => ({ cardId: l.cardId, quantity: l.qty, side: "OFFER" as const })),
              ...request.map((l) => ({ cardId: l.cardId, quantity: l.qty, side: "REQUEST" as const })),
            ],
          },
        },
      });
    });
  } catch (e) {
    if (e instanceof TradeError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath("/echanges");
  return { ok: true };
}

/** Déplace `qty` exemplaires de `cardId` de `from` vers `to` (la carte quitte sa collection s'il n'en reste plus). */
async function move(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  fromId: string,
  toId: string,
  cardId: string,
  qty: number,
) {
  const taken = await tx.userCard.updateMany({
    where: { userId: fromId, cardId, count: { gte: qty } },
    data: { count: { decrement: qty } },
  });
  if (taken.count === 0) throw new TradeError("Une des cartes n'est plus disponible : l'échange a été annulé.");
  await tx.userCard.deleteMany({ where: { userId: fromId, cardId, count: { lte: 0 } } });
  await tx.userCard.upsert({
    where: { userId_cardId: { userId: toId, cardId } },
    create: { userId: toId, cardId, count: qty },
    update: { count: { increment: qty } },
  });
}

export async function acceptTrade(fd: FormData): Promise<void> {
  const me = await requireUser();
  const id = String(fd.get("id") ?? "");
  await expireTrades();
  let fromId = null as string | null;
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.trade.updateMany({
        where: { id, toId: me.id, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { status: "ACCEPTED", resolvedAt: new Date() },
      });
      if (claimed.count === 0) throw new TradeError("Cette proposition n'est plus disponible.");
      const trade = await tx.trade.findUniqueOrThrow({
        where: { id },
        include: { items: { include: { card: { select: { active: true } } } } },
      });
      for (const it of trade.items) {
        if (!it.card.active) throw new TradeError("Une des cartes a été retirée du jeu.");
        if (it.side === "OFFER") await move(tx, trade.fromId, trade.toId, it.cardId, it.quantity);
        else await move(tx, trade.toId, trade.fromId, it.cardId, it.quantity);
      }
      fromId = trade.fromId;
    });
    if (fromId) await Promise.all([checkAchievements(me.id), checkAchievements(fromId)]);
  } catch (e) {
    if (!(e instanceof TradeError)) throw e;
    // L'échange n'est plus réalisable : on le marque comme échoué
    await prisma.trade.updateMany({
      where: { id, toId: me.id, status: "PENDING" },
      data: { status: "FAILED", resolvedAt: new Date() },
    });
  }
  revalidatePath("/", "layout");
}

export async function declineTrade(fd: FormData): Promise<void> {
  const me = await requireUser();
  await prisma.trade.updateMany({
    where: { id: String(fd.get("id") ?? ""), toId: me.id, status: "PENDING" },
    data: { status: "DECLINED", resolvedAt: new Date() },
  });
  revalidatePath("/", "layout");
}

export async function cancelTrade(fd: FormData): Promise<void> {
  const me = await requireUser();
  await prisma.trade.updateMany({
    where: { id: String(fd.get("id") ?? ""), fromId: me.id, status: "PENDING" },
    data: { status: "CANCELLED", resolvedAt: new Date() },
  });
  revalidatePath("/", "layout");
}
