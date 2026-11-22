import { prisma } from "@/lib/prisma";
import { ACHIEVEMENTS, type Stats } from "@/lib/achievements";

export async function computeStats(userId: string, extra: { luckyPack?: boolean } = {}): Promise<Stats> {
  const [user, owned, cards, tradesDone, featuredIn, lucky, votes, anecdotes, awards, tournamentsPlayed, advent] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { packsOpened: true, recycledCount: true, duelWins: true, prestige: true } }),
    prisma.userCard.findMany({
      where: { userId, card: { active: true } },
      select: { count: true, shiny: true, level: true, card: { select: { rarity: true, element: true, seriesId: true, eventName: true, variantOfId: true } } },
    }),
    prisma.card.findMany({ where: { active: true, exclusive: false }, select: { rarity: true, element: true, seriesId: true } }),
    prisma.trade.count({ where: { status: "ACCEPTED", OR: [{ fromId: userId }, { toId: userId }] } }),
    prisma.card.count({ where: { subjectId: userId, subject: { consent: true } } }),
    extra.luckyPack
      ? Promise.resolve(true)
      : prisma.userAchievement
          .findUnique({ where: { userId_achievementId: { userId, achievementId: "lucky_pack" } } })
          .then(Boolean),
    prisma.pollVote.count({ where: { userId } }),
    prisma.anecdote.count({ where: { authorId: userId, status: "APPROVED" } }),
    prisma.seasonAward.findMany({ where: { userId }, select: { kind: true, rank: true } }),
    prisma.tournamentEntry.count({ where: { userId, tournament: { status: "FINISHED" } } }),
    prisma.adventClaim.groupBy({ by: ["year"], where: { userId }, _count: true }),
  ]);

  const elementTotals = new Map<string, number>();
  for (const c of cards) elementTotals.set(c.element, (elementTotals.get(c.element) ?? 0) + 1);
  const elementOwned = new Map<string, number>();
  for (const o of owned) elementOwned.set(o.card.element, (elementOwned.get(o.card.element) ?? 0) + 1);

  // Élément le plus avancé parmi ceux qui ont au moins 3 cartes
  let bestDone = 0;
  let bestTarget = 0;
  let completed = false;
  for (const [el, total] of elementTotals) {
    if (total < 3) continue;
    const got = elementOwned.get(el) ?? 0;
    if (got >= total) completed = true;
    if (got / total > (bestTarget ? bestDone / bestTarget : -1)) {
      bestDone = got;
      bestTarget = total;
    }
  }

  const seriesTotals = new Map<string, number>();
  for (const c of cards) if (c.seriesId) seriesTotals.set(c.seriesId, (seriesTotals.get(c.seriesId) ?? 0) + 1);
  const seriesOwned = new Map<string, number>();
  for (const o of owned) if (o.card.seriesId) seriesOwned.set(o.card.seriesId, (seriesOwned.get(o.card.seriesId) ?? 0) + 1);
  const bigSeries = [...seriesTotals].filter(([, n]) => n >= 3);

  return {
    seriesCompleted: bigSeries.filter(([id, n]) => (seriesOwned.get(id) ?? 0) >= n).length,
    seriesTotal: bigSeries.length,
    eventOwned: owned.filter((o) => o.card.eventName).length,
    altOwned: owned.filter((o) => o.card.variantOfId).length,
    maxLevel: owned.reduce((m, o) => Math.max(m, o.level), 1),
    maxedCards: owned.filter((o) => o.level >= 5).length,
    prestige: user?.prestige ?? 0,
    podiums: awards.filter((a) => a.kind === "DUEL_MONTH" && a.rank <= 3).length,
    championships: awards.filter((a) => a.kind === "DUEL_MONTH" && a.rank === 1).length,
    tournamentWins: awards.filter((a) => a.kind === "TOURNAMENT" && a.rank === 1).length,
    tournamentsPlayed,
    adventBest: advent.reduce((m, a) => Math.max(m, a._count), 0),
    shinyComplete: cards.length > 0 && owned.filter((o) => o.shiny > 0).length >= cards.length,
    packsOpened: user?.packsOpened ?? 0,
    uniqueCards: owned.length,
    totalActiveCards: cards.length,
    maxCopies: owned.reduce((m, o) => Math.max(m, o.count), 0),
    epicOwned: owned.filter((o) => o.card.rarity === "EPIQUE").length,
    legendaryOwned: owned.filter((o) => o.card.rarity === "LEGENDAIRE").length,
    legendaryTotal: cards.filter((c) => c.rarity === "LEGENDAIRE").length,
    mythicOwned: owned.filter((o) => o.card.rarity === "MYTHIQUE").length,
    recycled: user?.recycledCount ?? 0,
    duelWins: user?.duelWins ?? 0,
    votes,
    anecdotes,
    shinyOwned: owned.filter((o) => o.shiny > 0).length,
    tradesDone,
    featuredIn,
    bestElementDone: bestDone,
    bestElementTarget: bestTarget,
    elementCompleted: completed,
    luckyPack: lucky,
  };
}

/** Débloque les succès atteints. Un succès débloqué n'est jamais retiré. */
export async function checkAchievements(userId: string, extra: { luckyPack?: boolean } = {}) {
  const stats = await computeStats(userId, extra);
  const reached = ACHIEVEMENTS.filter((a) => {
    const [cur, target] = a.progress(stats);
    return cur >= target;
  }).map((a) => a.id);
  if (reached.length) {
    await prisma.userAchievement.createMany({
      data: reached.map((achievementId) => ({ userId, achievementId })),
      skipDuplicates: true,
    });
  }
  return stats;
}
