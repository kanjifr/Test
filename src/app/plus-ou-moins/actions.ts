"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toCardView } from "@/lib/cards";
import type { CardView } from "@/lib/game";
import { addCoins } from "@/lib/coins";
import { currentWeek } from "@/lib/quests";
import { checkAchievements } from "@/lib/achievements-server";

import { HL_BOOSTER_AT, HL_COINS_MAX, HL_COINS_PER } from "@/lib/highlow";
const DECK = 40;

const subject = { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } } as const;
const parisDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function cardView(id: string): Promise<CardView | null> {
  const c = await prisma.card.findUnique({ where: { id }, include: subject });
  return c ? toCardView(c) : null;
}

export type HLState = { id: string; current: CardView; streak: number; done: boolean; rewarded: boolean; coins: number };
export type HLGuess =
  | { ok: true; correct: boolean; next: CardView; streak: number; done: boolean; coins: number; booster: boolean }
  | { ok: false; error: string };

export async function startHighLow(): Promise<{ ok: true; state: HLState } | { ok: false; error: string }> {
  const me = await requireUser();
  const day = parisDay();
  let run = await prisma.highLowRun.findFirst({ where: { userId: me.id, done: false } });
  if (!run) {
    const cards = await prisma.card.findMany({ where: { active: true, exclusive: false }, select: { id: true } });
    if (cards.length < 5) return { ok: false, error: "Pas encore assez de cartes pour jouer." };
    // Paquet mélangé ; on recommence le paquet s'il y a moins de 40 cartes
    const deck: string[] = [];
    while (deck.length < DECK) {
      const ids = cards.map((c) => c.id);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = randomInt(0, i + 1);
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      for (const id of ids) if (deck.length < DECK && deck.at(-1) !== id) deck.push(id);
    }
    const rewardedToday = await prisma.highLowRun.count({ where: { userId: me.id, day, rewarded: true } });
    run = await prisma.highLowRun.create({ data: { userId: me.id, day, deck, rewarded: rewardedToday === 0 } });
  }
  const current = await cardView(run.deck[run.index]);
  if (!current) return { ok: false, error: "Carte introuvable." };
  return { ok: true, state: { id: run.id, current, streak: run.streak, done: run.done, rewarded: run.rewarded, coins: run.coins } };
}

export async function guessHighLow(runId: string, dir: "up" | "down"): Promise<HLGuess> {
  const me = await requireUser();
  const run = await prisma.highLowRun.findFirst({ where: { id: String(runId), userId: me.id, done: false } });
  if (!run) return { ok: false, error: "Partie terminée." };
  const [cur, nxt] = await Promise.all([cardView(run.deck[run.index]), cardView(run.deck[run.index + 1])]);
  if (!cur || !nxt) return { ok: false, error: "Carte introuvable." };
  // Égalité = gagné
  const correct = dir === "up" ? nxt.attack >= cur.attack : nxt.attack <= cur.attack;
  const streak = correct ? run.streak + 1 : run.streak;
  const done = !correct || run.index + 2 >= run.deck.length;
  const coins = run.rewarded && done ? Math.min(HL_COINS_MAX, streak * HL_COINS_PER) : 0;
  const booster = run.rewarded && done && streak >= HL_BOOSTER_AT;
  // Mise à jour conditionnelle : une seule réponse par carte
  const up = await prisma.highLowRun.updateMany({
    where: { id: run.id, done: false, index: run.index },
    data: { index: run.index + 1, streak, done, coins, ...(done ? { endedAt: new Date() } : {}) },
  });
  if (up.count === 0) return { ok: false, error: "Réponse déjà donnée." };
  if (done) {
    if (coins) await addCoins(prisma, me.id, coins, `Plus ou moins : série de ${streak}`);
    if (booster) await prisma.user.update({ where: { id: me.id }, data: { bonusPacks: { increment: 1 } } });
    // Quête : meilleure série de la semaine
    const week = currentWeek();
    await prisma.weeklyProgress.upsert({ where: { userId_week: { userId: me.id, week } }, create: { userId: me.id, week, highlow: streak }, update: {} });
    await prisma.weeklyProgress.updateMany({ where: { userId: me.id, week, highlow: { lt: streak } }, data: { highlow: streak } });
    await checkAchievements(me.id);
    revalidatePath("/plus-ou-moins");
  }
  return { ok: true, correct, next: nxt, streak, done, coins, booster };
}
