"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prestigeProgress, PRESTIGE_REWARD } from "@/lib/prestige";
import { siteUrl } from "@/lib/discord";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { drawBooster, PACK_COOLDOWN_MS, PACK_SIZE, PITY_HARD, SHINY_CHANCE, type CardView } from "@/lib/game";
import { giveCopies } from "@/lib/copies";
import { BIRTHDAY_BOOST, isBirthdayToday, validBirthday } from "@/lib/birthday";
import { toCardView } from "@/lib/cards";
import { checkAchievements } from "@/lib/achievements-server";
import { ACHIEVEMENT_BY_ID } from "@/lib/achievements";
import { announcePull, announceText } from "@/lib/announce";
import { boosterWhere, seriesWeight } from "@/lib/series";
import { currentWeek, QUEST_REWARD, questsOfWeek, recordProgress } from "@/lib/quests";

const rand = () => randomInt(0, 1_000_000) / 1_000_000;

export type OpenResult =
  | {
      ok: true;
      cards: (CardView & { isNew: boolean; count: number })[];
      nextAt: number;
      /** Boosters bonus restants */
      bonus: number;
      /** Boosters ouverts depuis la dernière Mythique, après ce booster */
      pity: number;
      mythicAvailable: boolean;
    }
  | { ok: false; error: string; nextAt?: number };

export async function openPack(): Promise<OpenResult> {
  const user = await requireUser();

  // Cartes des séries ouvertes aux boosters, et cartes d'événement en cours
  const cards = await prisma.card.findMany({
    where: boosterWhere(),
    include: { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } },
  });
  // Il faut au moins une carte non Mythique pour remplir un booster
  if (!cards.some((c) => c.rarity !== "MYTHIQUE")) {
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
  // Booster pas encore prêt : on utilise un booster bonus s'il en reste (le minuteur continue)
  let usedBonus = false;
  if (reserved.count === 0) {
    const bonus = await prisma.user.updateMany({
      where: { id: user.id, bonusPacks: { gt: 0 } },
      data: { bonusPacks: { decrement: 1 }, packsOpened: { increment: 1 } },
    });
    usedBonus = bonus.count > 0;
  }
  if (reserved.count === 0 && !usedBonus) {
    const u = await prisma.user.findUnique({ where: { id: user.id }, select: { lastPackAt: true } });
    const nextAt = (u?.lastPackAt?.getTime() ?? 0) + PACK_COOLDOWN_MS;
    return { ok: false, error: "Ton prochain booster n'est pas encore prêt.", nextAt };
  }

  // Pas de booster en parallèle (réservation ci-dessus) : le compteur de pity lu ici est fiable
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { pityCount: true, bonusPacks: true, lastPackAt: true },
  });
  // Les cartes des membres qui fêtent leur anniversaire sortent plus souvent aujourd'hui
  // Les cartes d'événement sortent plus souvent pendant l'événement, les alternatives plus rarement
  const weightOf = (c: (typeof cards)[number]) =>
    (c.subject?.consent && isBirthdayToday(c.subject.birthMonth, c.subject.birthDay) ? BIRTHDAY_BOOST : 1) * seriesWeight(c);
  const booster = drawBooster(cards, PACK_SIZE, Math.min(me.pityCount, PITY_HARD - 1), rand, weightOf);
  const drawn = booster.cards;
  const mythicAvailable = cards.some((c) => c.rarity === "MYTHIQUE");

  const result = await prisma.$transaction(async (tx) => {
    if (booster.pityCount !== me.pityCount) {
      await tx.user.update({ where: { id: user.id }, data: { pityCount: booster.pityCount } });
    }
    const out: (CardView & { isNew: boolean; count: number })[] = [];
    for (const card of drawn) {
      // Chaque carte a une petite chance d'être une version brillante
      const shiny = rand() < SHINY_CHANCE;
      const owned = await giveCopies(tx, user.id, card.id, 1, shiny);
      const isNew = owned.count === 1;
      await tx.pull.create({ data: { userId: user.id, cardId: card.id, isNew, shiny } });
      out.push({ ...toCardView(card), isNew, count: owned.count, shiny });
    }
    return out;
  });

  await recordProgress(user.id, "packs", 1);
  const lucky = drawn.filter((c) => c.rarity === "EPIQUE" || c.rarity === "LEGENDAIRE" || c.rarity === "MYTHIQUE").length >= 2;
  await checkAchievements(user.id, { luckyPack: lucky });
  await announcePull({ discordId: user.discordId, name: user.name }, result).catch(() => {});

  revalidatePath("/collection");
  return {
    ok: true,
    cards: result,
    nextAt: (me.lastPackAt?.getTime() ?? now.getTime()) + PACK_COOLDOWN_MS,
    bonus: me.bonusPacks,
    pity: booster.pityCount,
    mythicAvailable,
  };
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

export async function setBirthday(formData: FormData) {
  const user = await requireUser();
  const month = Number(formData.get("month"));
  const day = Number(formData.get("day"));
  const clear = formData.get("clear") === "1" || !month || !day;
  if (!clear && !validBirthday(month, day)) return;
  await prisma.user.update({
    where: { id: user.id },
    data: clear ? { birthMonth: null, birthDay: null } : { birthMonth: month, birthDay: day },
  });
  revalidatePath("/", "layout");
}

export async function setShowcase(formData: FormData) {
  const user = await requireUser();
  const ids = [...new Set(formData.getAll("card").map(String).filter(Boolean))].slice(0, 3);
  const owned = await prisma.userCard.findMany({ where: { userId: user.id, cardId: { in: ids } }, select: { cardId: true } });
  const ok = new Set(owned.map((o) => o.cardId));
  await prisma.user.update({ where: { id: user.id }, data: { showcase: ids.filter((id) => ok.has(id)) } });
  revalidatePath("/", "layout");
}

export type ClaimResult = { ok: true; bonus: number } | { ok: false; error: string };

/** Récupère la récompense d'une quête de la semaine terminée. */
export async function claimQuest(questId: string): Promise<ClaimResult> {
  const user = await requireUser();
  const id = String(questId ?? "");
  const week = currentWeek();
  const quest = questsOfWeek(week).find((q) => q.id === id);
  if (!quest) return { ok: false, error: "Cette quête n'est plus disponible." };
  const row = await prisma.weeklyProgress.findUnique({ where: { userId_week: { userId: user.id, week } } });
  if (!row || row[quest.field] < quest.target) return { ok: false, error: "Quête pas encore terminée." };
  const bonus = await prisma.$transaction(async (tx) => {
    // Une seule récompense par quête, même en cas de double clic
    const marked = await tx.weeklyProgress.updateMany({
      where: { userId: user.id, week, NOT: { claimed: { has: id } } },
      data: { claimed: { push: id } },
    });
    if (marked.count === 0) return null;
    const u = await tx.user.update({ where: { id: user.id }, data: { bonusPacks: { increment: QUEST_REWARD } }, select: { bonusPacks: true } });
    return u.bonusPacks;
  });
  if (bonus === null) return { ok: false, error: "Récompense déjà récupérée." };
  revalidatePath("/");
  return { ok: true, bonus };
}

/** Prestige : le membre qui a toute la collection la remet à zéro contre une étoile permanente. */
export async function prestigeReset(): Promise<void> {
  const user = await requireUser();
  const { ready } = await prestigeProgress(user.id);
  if (!ready) redirect("/profil?err=" + encodeURIComponent("Il te faut toutes les cartes (hors événements) pour passer au prestige."));
  const u = await prisma.$transaction(async (tx) => {
    await tx.userCard.deleteMany({ where: { userId: user.id } });
    // Les échanges en attente ne sont plus réalisables
    await tx.trade.updateMany({
      where: { status: "PENDING", OR: [{ fromId: user.id }, { toId: user.id }] },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    });
    return tx.user.update({
      where: { id: user.id },
      data: { prestige: { increment: 1 }, bonusPacks: { increment: PRESTIGE_REWARD }, showcase: [], defenseTeam: [] },
      select: { prestige: true, name: true },
    });
  });
  await prisma.adminLog.create({
    data: { actorId: user.id, actorName: u.name ?? "?", action: "prestige", details: `est passé au prestige ${u.prestige} (collection remise à zéro)` },
  });
  await checkAchievements(user.id);
  const link = siteUrl(`/membre/${user.id}`);
  await announceText(`✪ **${u.name}** a complété toute la collection et passe au **prestige ${u.prestige}** ! Sa collection repart de zéro…${link ? ` ${link}` : ""}`).catch(() => {});
  revalidatePath("/", "layout");
  redirect("/profil?ok=prestige#prestige");
}
