"use server";

import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { rng, simulateDuel } from "@/lib/duel";
import {
  DUEL_DAILY_LIMIT,
  DUEL_DAILY_REWARD,
  DUEL_SAME_OPPONENT_LIMIT,
  DUEL_TEAM_SIZE,
  defenseTeamOf,
  ownedFighters,
  parisDayStart,
  trainingTeam,
} from "@/lib/duel-server";
import { checkAchievements } from "@/lib/achievements-server";
import { announceDuel } from "@/lib/announce";
import { recordProgress } from "@/lib/quests";
import { cardsAway } from "@/lib/expeditions-server";
import { addCoins, getShopConfig } from "@/lib/coins";
import { duelCoins, eloDelta, K_ATTACK, K_DEFENSE, REWARD_MIN_GAIN } from "@/lib/elo";

export type DuelStart = { ok: true; id: string } | { ok: false; error: string };

async function myTeam(userId: string, ids: unknown, forAttack = true) {
  const list = Array.isArray(ids) ? ids.map(String) : [];
  if (list.length !== DUEL_TEAM_SIZE || new Set(list).size !== DUEL_TEAM_SIZE) {
    throw new Error(`Choisis ${DUEL_TEAM_SIZE} cartes différentes.`);
  }
  const owned = new Map((await ownedFighters(userId)).map((f) => [f.id, f]));
  const team = list.map((id) => owned.get(id));
  if (team.some((f) => !f)) throw new Error("Une des cartes choisies n'est plus dans ta collection.");
  const away = forAttack ? await cardsAway(userId) : new Set<string>();
  if (list.some((id) => away.has(id))) throw new Error("Une des cartes choisies est en expédition : elle ne peut pas attaquer.");
  return team as NonNullable<(typeof team)[number]>[];
}

export async function startDuel(input: { opponent: string; team: string[] }): Promise<DuelStart> {
  const me = await requireUser();
  const training = input?.opponent === "training";
  try {
    const team = await myTeam(me.id, input?.team);
    const seed = randomInt(0, 2 ** 31);
    let opponentTeam;
    let defenderId: string | null = null;

    if (training) {
      opponentTeam = await trainingTeam(team, rng(seed ^ 0x5bd1e995));
    } else {
      defenderId = String(input?.opponent ?? "");
      if (!defenderId || defenderId === me.id) throw new Error("Adversaire invalide.");
      const since = parisDayStart();
      const [today, againstHim, exists] = await Promise.all([
        prisma.duel.count({ where: { attackerId: me.id, defenderId: { not: null }, tournamentId: null, createdAt: { gte: since } } }),
        prisma.duel.count({ where: { attackerId: me.id, defenderId, tournamentId: null, createdAt: { gte: since } } }),
        prisma.user.findUnique({ where: { id: defenderId }, select: { id: true } }),
      ]);
      if (!exists) throw new Error("Membre introuvable.");
      if (today >= DUEL_DAILY_LIMIT) throw new Error(`Tu as déjà fait tes ${DUEL_DAILY_LIMIT} duels du jour. Reviens demain, ou entraîne-toi !`);
      if (againstHim >= DUEL_SAME_OPPONENT_LIMIT) throw new Error(`Tu as déjà défié ce membre ${DUEL_SAME_OPPONENT_LIMIT} fois aujourd'hui.`);
      opponentTeam = await defenseTeamOf(defenderId);
    }
    if (opponentTeam.length < DUEL_TEAM_SIZE) throw new Error(`Ton adversaire n'a pas encore ${DUEL_TEAM_SIZE} cartes.`);

    const log = simulateDuel(team, opponentTeam, seed);
    const shop = await getShopConfig();
    const result = log.winner === 0 ? "ATTACKER" : log.winner === 1 ? "DEFENDER" : "DRAW";

    const duel = await prisma.$transaction(async (tx) => {
      // Cote Elo : l'attaquant met K_ATTACK points en jeu, le défenseur K_DEFENSE
      let attackerDelta: number | null = null;
      let defenderDelta: number | null = null;
      let ratings: { a: number; d: number } | null = null;
      if (defenderId) {
        const [ua, ud] = await Promise.all([
          tx.user.findUniqueOrThrow({ where: { id: me.id }, select: { duelRating: true, duelPeak: true } }),
          tx.user.findUniqueOrThrow({ where: { id: defenderId }, select: { duelRating: true, duelPeak: true } }),
        ]);
        ratings = { a: ua.duelRating, d: ud.duelRating };
        const score = result === "ATTACKER" ? 1 : result === "DRAW" ? 0.5 : 0;
        attackerDelta = eloDelta(ua.duelRating, ud.duelRating, score, K_ATTACK);
        defenderDelta = eloDelta(ud.duelRating, ua.duelRating, 1 - score, K_DEFENSE);
        const na = Math.max(0, ua.duelRating + attackerDelta);
        const nd = Math.max(0, ud.duelRating + defenderDelta);
        await tx.user.update({ where: { id: me.id }, data: { duelRating: na, duelPeak: Math.max(ua.duelPeak, na) } });
        await tx.user.update({ where: { id: defenderId }, data: { duelRating: nd, duelPeak: Math.max(ud.duelPeak, nd) } });
      }
      // Booster du jour : seulement pour une vraie victoire (pas contre un adversaire bien plus faible)
      let rewarded = false;
      if (defenderId && result === "ATTACKER" && DUEL_DAILY_REWARD > 0 && (attackerDelta ?? 0) >= REWARD_MIN_GAIN) {
        const already = await tx.duel.count({ where: { attackerId: me.id, rewarded: true, createdAt: { gte: parisDayStart() } } });
        rewarded = already === 0;
      }
      const d = await tx.duel.create({
        data: { attackerId: me.id, defenderId, result, rewarded, attackerDelta, defenderDelta, log: log as unknown as Prisma.InputJsonValue },
      });
      // Pièces pour l'attaquant, selon la difficulté du duel (duels contre des membres uniquement)
      if (defenderId && ratings) {
        const gain = duelCoins(result === "ATTACKER", ratings.a, ratings.d, { win: shop.duelWin, loss: shop.duelLoss });
        if (gain) await addCoins(tx, me.id, gain, result === "ATTACKER" ? "Victoire en duel" : "Duel livré");
      }
      if (defenderId && result !== "DRAW") {
        const attackerWon = result === "ATTACKER";
        await tx.user.update({
          where: { id: me.id },
          data: attackerWon
            ? { duelWins: { increment: 1 }, ...(rewarded ? { bonusPacks: { increment: DUEL_DAILY_REWARD } } : {}) }
            : { duelLosses: { increment: 1 } },
        });
        await tx.user.update({
          where: { id: defenderId },
          data: attackerWon ? { duelLosses: { increment: 1 } } : { duelWins: { increment: 1 } },
        });
      }
      return d;
    });
    await recordProgress(me.id, "duels", 1);
    if (defenderId && result === "ATTACKER") await recordProgress(me.id, "duelWins", 1);
    await Promise.all([checkAchievements(me.id), defenderId ? checkAchievements(defenderId) : null]);
    if (defenderId && result !== "DRAW") {
      const people = await prisma.user.findMany({ where: { id: { in: [me.id, defenderId] } }, select: { id: true, name: true, discordId: true } });
      const attacker = people.find((p) => p.id === me.id)!;
      const defender = people.find((p) => p.id === defenderId)!;
      const [winner, loser] = result === "ATTACKER" ? [attacker, defender] : [defender, attacker];
      await announceDuel(winner, loser, log.score, duel.id).catch(() => {});
    }
    revalidatePath("/duels");
    return { ok: true, id: duel.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function saveDefenseTeam(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  try {
    // Une carte en expédition peut quand même défendre
    const team = await myTeam(me.id, ids, false);
    await prisma.user.update({ where: { id: me.id }, data: { defenseTeam: team.map((f) => f.id) } });
    revalidatePath("/duels");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
