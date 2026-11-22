import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { power, rng, simulateDuel, type DuelLog } from "@/lib/duel";
import { DUEL_TEAM_SIZE, defenseTeamOf } from "@/lib/duel-server";
import { announceText } from "@/lib/announce";
import { siteUrl } from "@/lib/discord";
import { checkAchievements } from "@/lib/achievements-server";
import type { CardView } from "@/lib/game";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 64;

export type Match = { a: string | null; b: string | null; duelId?: string; score?: [number, number]; winner: string | null };
export type Bracket = { rounds: { matches: Match[] }[] };

/** Nom d'un tour selon le nombre de matchs. */
export function roundName(matches: number) {
  if (matches === 1) return "Finale";
  if (matches === 2) return "Demi-finales";
  if (matches === 4) return "Quarts de finale";
  return `${matches * 2}es de finale`;
}

/**
 * Joue un match : en cas d'égalité au score, on rejoue (jusqu'à 5 fois),
 * puis l'équipe la plus puissante passe.
 */
function playMatch(teamA: CardView[], teamB: CardView[], seed: number): { log: DuelLog; aWins: boolean } {
  for (let i = 0; i < 5; i++) {
    const log = simulateDuel(teamA, teamB, seed + i * 7919);
    if (log.winner !== -1) return { log, aWins: log.winner === 0 };
  }
  const log = simulateDuel(teamA, teamB, seed);
  const pa = teamA.reduce((s, f) => s + power(f), 0);
  const pb = teamB.reduce((s, f) => s + power(f), 0);
  return { log, aWins: pa >= pb };
}

/** Tirage au sort, combats de tous les tours, récompenses et annonce. */
export async function runTournament(id: string) {
  // Verrou : un seul lancement possible (le statut passe à FINISHED tout de suite)
  const claimed = await prisma.tournament.updateMany({ where: { id, status: "REGISTRATION" }, data: { status: "FINISHED" } });
  if (claimed.count === 0) return;
  const t = await prisma.tournament.findUniqueOrThrow({
    where: { id },
    include: { entries: { include: { user: { select: { id: true, name: true, discordId: true } } } } },
  });

  // Équipes figées au moment du tirage ; les membres sans 3 cartes sont retirés
  const teams = new Map<string, CardView[]>();
  for (const e of t.entries) {
    const team = await defenseTeamOf(e.userId);
    if (team.length >= DUEL_TEAM_SIZE) teams.set(e.userId, team);
  }
  const names = new Map(t.entries.map((e) => [e.userId, e.user.name ?? "?"]));
  const players = [...teams.keys()];
  if (players.length < MIN_PLAYERS) {
    await prisma.tournament.update({ where: { id }, data: { status: "CANCELLED" } });
    await announceText(`🏆 Le tournoi **${t.name}** est annulé : pas assez de participants.`);
    return;
  }

  const seed = randomInt(0, 2 ** 31);
  const rand = rng(seed);
  // Mélange, puis tableau à la puissance de 2 supérieure (les premiers tirés sont exemptés du 1er tour)
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }
  let size = 1;
  while (size < players.length) size *= 2;
  const byes = size - players.length;
  const first: Match[] = [];
  let p = 0;
  for (let i = 0; i < size / 2; i++) {
    if (i < byes) first.push({ a: players[p++], b: null, winner: null });
    else first.push({ a: players[p++], b: players[p++], winner: null });
  }

  const bracket: Bracket = { rounds: [] };
  let current = first;
  let round = 0;
  while (true) {
    for (const [i, m] of current.entries()) {
      if (!m.b || !m.a) {
        m.winner = m.a ?? m.b;
        continue;
      }
      const { log, aWins } = playMatch(teams.get(m.a)!, teams.get(m.b)!, (seed + round * 1009 + i * 31) >>> 0);
      const duel = await prisma.duel.create({
        data: {
          attackerId: m.a,
          defenderId: m.b,
          tournamentId: id,
          // Résultat officiel du match, même après un départage
          result: aWins ? "ATTACKER" : "DEFENDER",
          log: log as unknown as Prisma.InputJsonValue,
        },
      });
      m.duelId = duel.id;
      m.score = log.score;
      m.winner = aWins ? m.a : m.b;
    }
    bracket.rounds.push({ matches: current });
    if (current.length === 1) break;
    const next: Match[] = [];
    for (let i = 0; i < current.length; i += 2) next.push({ a: current[i].winner, b: current[i + 1].winner, winner: null });
    current = next;
    round++;
  }

  const final = bracket.rounds.at(-1)!.matches[0];
  const winnerId = final.winner!;
  const finalistId = final.a === winnerId ? final.b : final.a;
  const finalistReward = Math.floor(t.reward / 2);
  await prisma.$transaction(async (tx) => {
    await tx.tournament.update({ where: { id }, data: { bracket: bracket as unknown as Prisma.InputJsonValue, winnerId } });
    await tx.seasonAward.create({ data: { kind: "TOURNAMENT", period: id, rank: 1, userId: winnerId, label: `Vainqueur : ${t.name}` } });
    if (t.reward > 0) await tx.user.update({ where: { id: winnerId }, data: { bonusPacks: { increment: t.reward } } });
    if (finalistId) {
      await tx.seasonAward.create({ data: { kind: "TOURNAMENT", period: id, rank: 2, userId: finalistId, label: `Finaliste : ${t.name}` } });
      if (finalistReward > 0) await tx.user.update({ where: { id: finalistId }, data: { bonusPacks: { increment: finalistReward } } });
    }
  });
  for (const pid of players) await checkAchievements(pid);

  const link = siteUrl(`/tournois/${id}`);
  await announceText(
    `🏆 **Tournoi ${t.name} terminé !** ${players.length} participants.\n🥇 **${names.get(winnerId)}** remporte le tournoi${t.reward > 0 ? ` (+${t.reward} booster${t.reward > 1 ? "s" : ""})` : ""}` +
      (finalistId ? `\n🥈 ${names.get(finalistId)} finaliste${finalistReward > 0 ? ` (+${finalistReward})` : ""}` : "") +
      (link ? `\nTous les combats : ${link}` : ""),
  );
}

/** Lance les tournois dont l'heure est passée (appelé par le planificateur et à l'ouverture des pages). */
export async function runDueTournaments() {
  const due = await prisma.tournament.findMany({ where: { status: "REGISTRATION", startsAt: { lte: new Date() } }, select: { id: true } });
  for (const t of due) {
    try {
      await runTournament(t.id);
    } catch (e) {
      console.error("[tournoi]", (e as Error).message);
      // Lancement interrompu : on efface les combats déjà joués et on réessaiera
      await prisma.duel.deleteMany({ where: { tournamentId: t.id } }).catch(() => {});
      await prisma.seasonAward.deleteMany({ where: { kind: "TOURNAMENT", period: t.id } }).catch(() => {});
      await prisma.tournament.updateMany({ where: { id: t.id, winnerId: null }, data: { status: "REGISTRATION", bracket: undefined } }).catch(() => {});
    }
  }
}
