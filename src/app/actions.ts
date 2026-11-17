"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { drawPack, PACK_COOLDOWN_MS, PACK_SIZE, type CardView } from "@/lib/game";
import { toCardView } from "@/lib/cards";
import { checkAchievements } from "@/lib/achievements-server";
import { ACHIEVEMENT_BY_ID } from "@/lib/achievements";

const rand = () => randomInt(0, 1_000_000) / 1_000_000;

export type OpenResult =
  | { ok: true; cards: (CardView & { isNew: boolean; count: number })[]; nextAt: number }
  | { ok: false; error: string; nextAt?: number };

export async function openPack(): Promise<OpenResult> {
  const user = await requireUser();

  const cards = await prisma.card.findMany({
    where: { active: true },
    include: { subject: { select: { image: true, consent: true } } },
  });
  if (cards.length === 0) {
    return { ok: false, error: "Aucune carte n'est encore disponible. Reviens bientôt !" };
  }

  const now = new Date();
  // Réservation atomique du booster : impossible d'en ouvrir deux en parallèle
  const reserved = await prisma.user.updateMany({
    where: {
      id: user.id,
      OR: [{ lastPackAt: null }, { lastPackAt: { lte: new Date(now.getTime() - PACK_COOLDOWN_MS) } }],
    },
    data: { lastPackAt: now, packsOpened: { increment: 1 } },
  });
  if (reserved.count === 0) {
    const u = await prisma.user.findUnique({ where: { id: user.id }, select: { lastPackAt: true } });
    const nextAt = (u?.lastPackAt?.getTime() ?? 0) + PACK_COOLDOWN_MS;
    return { ok: false, error: "Ton prochain booster n'est pas encore prêt.", nextAt };
  }

  const drawn = drawPack(cards, PACK_SIZE, rand);

  const result = await prisma.$transaction(async (tx) => {
    const out: (CardView & { isNew: boolean; count: number })[] = [];
    for (const card of drawn) {
      const owned = await tx.userCard.upsert({
        where: { userId_cardId: { userId: user.id, cardId: card.id } },
        create: { userId: user.id, cardId: card.id },
        update: { count: { increment: 1 } },
      });
      const isNew = owned.count === 1;
      await tx.pull.create({ data: { userId: user.id, cardId: card.id, isNew } });
      out.push({ ...toCardView(card), isNew, count: owned.count });
    }
    return out;
  });

  const lucky = drawn.filter((c) => c.rarity === "EPIQUE" || c.rarity === "LEGENDAIRE").length >= 2;
  await checkAchievements(user.id, { luckyPack: lucky });

  revalidatePath("/collection");
  return { ok: true, cards: result, nextAt: now.getTime() + PACK_COOLDOWN_MS };
}

export async function setConsent(formData: FormData) {
  const user = await requireUser();
  const consent = formData.get("consent") === "on";
  await prisma.user.update({ where: { id: user.id }, data: { consent } });
  await checkAchievements(user.id);
  revalidatePath("/", "layout");
}

export async function markAchievementsSeen(ids: string[]) {
  const user = await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) return;
  await prisma.userAchievement.updateMany({
    where: { userId: user.id, achievementId: { in: ids.map(String).slice(0, 50) } },
    data: { seen: true },
  });
}

export async function setFeaturedBadge(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("badge") ?? "");
  if (id && !ACHIEVEMENT_BY_ID.has(id)) return;
  if (id) {
    const owned = await prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId: user.id, achievementId: id } },
    });
    if (!owned) return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { featuredBadge: id || null } });
  revalidatePath("/", "layout");
}
