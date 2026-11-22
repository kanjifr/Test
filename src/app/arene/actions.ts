"use server";

import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toCardView } from "@/lib/cards";
import { rng, simulateDuel, type DuelLog } from "@/lib/duel";
import { parisDayStart } from "@/lib/duel-server";
import { spendCoins, addCoins } from "@/lib/coins";
import { giveCopies } from "@/lib/copies";
import { boosterWhere } from "@/lib/series";
import { RARITY_ORDER, type CardView } from "@/lib/game";
import { recordProgress } from "@/lib/quests";
import { checkAchievements } from "@/lib/achievements-server";
import {
  ARENA_ENTRY_COST,
  ARENA_MAX_LOSSES,
  ARENA_MAX_WINS,
  ARENA_PICKS,
  ARENA_REWARDS,
  ARENA_TEAM,
  arenaOffer,
  arenaOpponent,
  OPPONENT_NAMES,
} from "@/lib/arena";

const rand = () => randomInt(0, 1_000_000) / 1_000_000;
const subject = { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } } as const;

/** Toutes les cartes actives, statistiques de base (pas de bonus d'évolution : tout le monde est à égalité). */
async function arenaPool(): Promise<CardView[]> {
  const cards = await prisma.card.findMany({ where: { active: true, exclusive: false }, include: subject });
  return cards.map(toCardView);
}

export type ArenaAction = { ok: true; log?: DuelLog; names?: [string, string]; finished?: boolean } | { ok: false; error: string };

export async function startArena(): Promise<ArenaAction> {
  const me = await requireUser();
  const active = await prisma.arenaRun.findFirst({ where: { userId: me.id, status: { not: "DONE" } } });
  if (active) return { ok: false, error: "Tu as déjà une partie en cours." };
  const today = await prisma.arenaRun.count({ where: { userId: me.id, paid: false, createdAt: { gte: parisDayStart() } } });
  const paid = today > 0;
  const pool = await arenaPool();
  if (pool.length < ARENA_PICKS + 3) return { ok: false, error: "Pas encore assez de cartes pour l'arène." };
  const ok = await prisma.$transaction(async (tx) => {
    if (paid && !(await spendCoins(tx, me.id, ARENA_ENTRY_COST, "Entrée dans l'arène"))) return false;
    await tx.arenaRun.create({ data: { userId: me.id, paid, offer: arenaOffer(pool, new Set(), rand).map((c) => c.id) } });
    return true;
  });
  if (!ok) return { ok: false, error: `Il faut ${ARENA_ENTRY_COST} pièces pour une nouvelle partie aujourd'hui.` };
  revalidatePath("/arene");
  return { ok: true };
}

export async function pickArena(runId: string, cardId: string): Promise<ArenaAction> {
  const me = await requireUser();
  const run = await prisma.arenaRun.findFirst({ where: { id: String(runId), userId: me.id, status: "DRAFT" } });
  if (!run || !run.offer.includes(String(cardId))) return { ok: false, error: "Ce choix n'est plus possible. Recharge la page." };
  const picks = [...run.picks, String(cardId)];
  const done = picks.length >= ARENA_PICKS;
  const offer = done ? [] : arenaOffer(await arenaPool(), new Set(picks), rand).map((c) => c.id);
  // Mise à jour conditionnelle : pas de double choix
  const up = await prisma.arenaRun.updateMany({ where: { id: run.id, status: "DRAFT", picks: { equals: run.picks } }, data: { picks, offer, status: done ? "FIGHT" : "DRAFT" } });
  if (up.count === 0) return { ok: false, error: "Ce choix a déjà été fait." };
  revalidatePath("/arene");
  return { ok: true };
}

/** Fin de partie : récompense selon le nombre de victoires. */
async function finish(runId: string, userId: string, wins: number) {
  const r = ARENA_REWARDS[Math.min(wins, ARENA_MAX_WINS)];
  await prisma.$transaction(async (tx) => {
    const closed = await tx.arenaRun.updateMany({ where: { id: runId, status: { not: "DONE" } }, data: { status: "DONE", endedAt: new Date() } });
    if (closed.count === 0) return;
    let cardName: string | null = null;
    if (r.coins) await addCoins(tx, userId, r.coins, `Arène : ${wins} victoire${wins > 1 ? "s" : ""}`);
    if (r.boosters) await tx.user.update({ where: { id: userId }, data: { bonusPacks: { increment: r.boosters } } });
    if (r.card) {
      const min = RARITY_ORDER.indexOf(r.card);
      const pool = await tx.card.findMany({ where: { ...boosterWhere(), rarity: { in: RARITY_ORDER.slice(min, RARITY_ORDER.indexOf("LEGENDAIRE") + 1) } }, select: { id: true, name: true } });
      if (pool.length) {
        const c = pool[randomInt(0, pool.length)];
        const owned = await giveCopies(tx, userId, c.id, 1, false);
        await tx.pull.create({ data: { userId, cardId: c.id, isNew: owned.count === 1, shiny: false } });
        cardName = c.name;
      }
    }
    await tx.arenaRun.update({ where: { id: runId }, data: { reward: { ...r, cardName } as unknown as Prisma.InputJsonValue } });
  });
  await checkAchievements(userId);
}

export async function fightArena(runId: string, team: string[]): Promise<ArenaAction> {
  const me = await requireUser();
  const run = await prisma.arenaRun.findFirst({ where: { id: String(runId), userId: me.id, status: "FIGHT" } });
  if (!run) return { ok: false, error: "Partie introuvable." };
  const ids = Array.isArray(team) ? [...new Set(team.map(String))] : [];
  if (ids.length !== ARENA_TEAM || ids.some((id) => !run.picks.includes(id))) return { ok: false, error: `Choisis ${ARENA_TEAM} de tes cartes d'arène.` };
  const pool = await arenaPool();
  const byId = new Map(pool.map((c) => [c.id, c]));
  const mine = ids.map((id) => byId.get(id)).filter((c): c is CardView => !!c);
  if (mine.length !== ARENA_TEAM) return { ok: false, error: "Une carte n'est plus disponible." };
  const seed = randomInt(0, 2 ** 31);
  const opp = arenaOpponent(pool, run.wins, rng(seed ^ 0x2545f491));
  const log = simulateDuel(mine, opp, seed);
  const won = log.winner === 0;
  const lost = log.winner === 1;
  const names: [string, string] = ["Toi", OPPONENT_NAMES[Math.min(run.wins, OPPONENT_NAMES.length - 1)]];
  const up = await prisma.arenaRun.updateMany({
    where: { id: run.id, status: "FIGHT", wins: run.wins, losses: run.losses },
    data: {
      wins: run.wins + (won ? 1 : 0),
      losses: run.losses + (lost ? 1 : 0),
      lastLog: log as unknown as Prisma.InputJsonValue,
      lastNames: names,
    },
  });
  if (up.count === 0) return { ok: false, error: "Combat déjà joué." };
  if (won) await recordProgress(me.id, "arenaWins", 1);
  const wins = run.wins + (won ? 1 : 0);
  const losses = run.losses + (lost ? 1 : 0);
  const finished = wins >= ARENA_MAX_WINS || losses >= ARENA_MAX_LOSSES;
  if (finished) await finish(run.id, me.id, wins);
  revalidatePath("/arene");
  return { ok: true, log, names, finished };
}

/** Arrête la partie et encaisse la récompense des victoires déjà obtenues. */
export async function stopArena(runId: string): Promise<ArenaAction> {
  const me = await requireUser();
  const run = await prisma.arenaRun.findFirst({ where: { id: String(runId), userId: me.id, status: { not: "DONE" } } });
  if (!run) return { ok: false, error: "Partie introuvable." };
  await finish(run.id, me.id, run.wins);
  revalidatePath("/arene");
  return { ok: true, finished: true };
}
