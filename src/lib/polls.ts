import type { Poll, PollOption, PollVote } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { announcePoll, announcePollResult } from "@/lib/announce";

export const POLL_MAX_DAYS = 14;

type FullPoll = Poll & { options: (PollOption & { subject?: { name: string | null; image: string | null } | null })[]; votes: PollVote[] };

export const isOpen = (p: Pick<Poll, "closesAt">, now = new Date()) => p.closesAt > now;

/** Résultats d'un vote, du plus voté au moins voté, et le ou les gagnants. */
export function results(p: FullPoll) {
  const counts = new Map(p.options.map((o) => [o.id, 0]));
  for (const v of p.votes) counts.set(v.optionId, (counts.get(v.optionId) ?? 0) + 1);
  const total = p.votes.length;
  const rows = p.options
    .map((o) => ({ option: o, votes: counts.get(o.id) ?? 0, pct: total ? Math.round(((counts.get(o.id) ?? 0) / total) * 100) : 0 }))
    .sort((a, b) => b.votes - a.votes);
  const top = rows[0]?.votes ?? 0;
  const winners = top > 0 ? rows.filter((r) => r.votes === top).map((r) => r.option) : [];
  return { rows, total, winners };
}

export const pollInclude = {
  options: { include: { subject: { select: { name: true, image: true } } } },
  votes: true,
} as const;

/** Annonce sur Discord le résultat des votes terminés (une seule fois chacun). */
export async function finalizePolls() {
  const ended = await prisma.poll.findMany({
    where: { closesAt: { lte: new Date() }, resultAnnounced: false },
    include: pollInclude,
  });
  for (const p of ended) {
    const claimed = await prisma.poll.updateMany({ where: { id: p.id, resultAnnounced: false }, data: { resultAnnounced: true } });
    if (claimed.count === 0) continue;
    const { winners, total } = results(p);
    await announcePollResult(p.question, winners.map((w) => w.label), total).catch(() => {});
  }
}

export async function announceNewPoll(question: string, closesAt: Date) {
  await announcePoll(question, closesAt).catch(() => {});
}
