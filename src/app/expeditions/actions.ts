"use server";

import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { DEST_BY_ID, destinationsOfDay, DURATIONS, EXPEDITION_SLOTS, EXPEDITION_TEAM, teamFactor, type ExpeditionReward } from "@/lib/expeditions";
import { ownedFighters } from "@/lib/duel-server";
import { boosterWhere } from "@/lib/series";
import { drawPack, type CardView } from "@/lib/game";
import { giveCopies } from "@/lib/copies";
import { addCoins } from "@/lib/coins";
import { toCardView } from "@/lib/cards";
import { recordProgress } from "@/lib/quests";
import { checkAchievements } from "@/lib/achievements-server";

const rand = () => randomInt(0, 1_000_000) / 1_000_000;

export type ExpResult = { ok: true } | { ok: false; error: string };
export type ClaimView = { ok: true; coins: number; booster: boolean; card: (CardView & { isNew: boolean }) | null; destination: string } | { ok: false; error: string };

export async function startExpedition(input: { destination: string; hours: number; cardIds: string[] }): Promise<ExpResult> {
  const me = await requireUser();
  const dest = DEST_BY_ID.get(String(input?.destination ?? ""));
  const duration = DURATIONS.find((d) => d.hours === Number(input?.hours));
  const ids = Array.isArray(input?.cardIds) ? [...new Set(input.cardIds.map(String))] : [];
  if (!dest || !destinationsOfDay().some((d) => d.id === dest.id)) return { ok: false, error: "Cette destination n'est plus proposée aujourd'hui. Recharge la page." };
  if (!duration) return { ok: false, error: "Durée invalide." };
  if (ids.length !== EXPEDITION_TEAM) return { ok: false, error: `Choisis ${EXPEDITION_TEAM} cartes différentes.` };

  const [owned, active] = await Promise.all([
    ownedFighters(me.id),
    prisma.expedition.findMany({ where: { userId: me.id, claimedAt: null }, select: { id: true } }),
  ]);
  if (active.length >= EXPEDITION_SLOTS) return { ok: false, error: "Tu as déjà une expédition en cours." };
  const byId = new Map(owned.map((c) => [c.id, c]));
  const team = ids.map((id) => byId.get(id));
  if (team.some((c) => !c)) return { ok: false, error: "Une des cartes n'est plus dans ta collection." };

  // Le butin est tiré au départ (le bonus d'équipe augmente les pièces et la chance de carte)
  const factor = teamFactor(team as CardView[], dest);
  const reward: ExpeditionReward = { coins: Math.round(duration.coins * factor), cardId: null, shiny: false, booster: rand() < duration.boosterChance * factor, factor };
  if (rand() < Math.min(0.9, duration.cardChance * factor)) {
    const pool = await prisma.card.findMany({ where: boosterWhere(), select: { id: true, rarity: true } });
    const [card] = drawPack(pool, 1, rand);
    if (card) reward.cardId = card.id;
  }
  await prisma.expedition.create({
    data: {
      userId: me.id,
      destination: dest.id,
      cardIds: ids,
      hours: duration.hours,
      endsAt: new Date(Date.now() + duration.hours * 3600_000),
      reward: reward as unknown as Prisma.InputJsonValue,
    },
  });
  revalidatePath("/expeditions");
  revalidatePath("/duels");
  return { ok: true };
}

/** Récupère le butin d'une expédition terminée. */
export async function claimExpedition(id: string): Promise<ClaimView> {
  const me = await requireUser();
  const exp = await prisma.expedition.findFirst({ where: { id: String(id ?? ""), userId: me.id } });
  if (!exp || exp.claimedAt) return { ok: false, error: "Expédition introuvable." };
  if (exp.endsAt > new Date()) return { ok: false, error: "Tes cartes ne sont pas encore revenues." };
  const reward = exp.reward as unknown as ExpeditionReward;
  const result = await prisma.$transaction(async (tx) => {
    // Une seule récupération possible
    const done = await tx.expedition.updateMany({ where: { id: exp.id, claimedAt: null }, data: { claimedAt: new Date() } });
    if (done.count === 0) return null;
    const dest = DEST_BY_ID.get(exp.destination);
    if (reward.coins) await addCoins(tx, me.id, reward.coins, `Expédition : ${dest?.name ?? "voyage"}`);
    if (reward.booster) await tx.user.update({ where: { id: me.id }, data: { bonusPacks: { increment: 1 } } });
    let card: (CardView & { isNew: boolean }) | null = null;
    if (reward.cardId) {
      const c = await tx.card.findFirst({
        where: { id: reward.cardId, active: true },
        include: { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } },
      });
      if (c) {
        const owned = await giveCopies(tx, me.id, c.id, 1, false);
        await tx.pull.create({ data: { userId: me.id, cardId: c.id, isNew: owned.count === 1, shiny: false } });
        card = { ...toCardView(c), isNew: owned.count === 1 };
      }
    }
    return { coins: reward.coins, booster: reward.booster, card, destination: dest?.name ?? "" };
  });
  if (!result) return { ok: false, error: "Butin déjà récupéré." };
  await recordProgress(me.id, "expeditions", 1);
  await checkAchievements(me.id);
  revalidatePath("/", "layout");
  return { ok: true, ...result };
}

/** Rappelle les cartes avant la fin : elles reviennent sans rien. */
export async function recallExpedition(id: string): Promise<ExpResult> {
  const me = await requireUser();
  const done = await prisma.expedition.updateMany({
    where: { id: String(id ?? ""), userId: me.id, claimedAt: null, endsAt: { gt: new Date() } },
    data: { claimedAt: new Date(), reward: { coins: 0, cardId: null, shiny: false, booster: false, factor: 0 } },
  });
  if (done.count === 0) return { ok: false, error: "Impossible de rappeler cette expédition." };
  revalidatePath("/expeditions");
  revalidatePath("/duels");
  return { ok: true };
}
