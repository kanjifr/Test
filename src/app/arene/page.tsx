import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toCardView } from "@/lib/cards";
import { parisDayStart } from "@/lib/duel-server";
import { weekEnd } from "@/lib/quests";
import { ARENA_ENTRY_COST, ARENA_MAX_LOSSES, ARENA_MAX_WINS, ARENA_REWARDS, rewardLabel } from "@/lib/arena";
import { ArenaGame } from "@/components/ArenaGame";
import type { DuelLog } from "@/lib/duel";

export const dynamic = "force-dynamic";

export default async function ArenaPage() {
  const me = await requireUser();
  const weekStart = new Date(weekEnd().getTime() - 7 * 86400_000);
  const [run, freeUsed, last, best, coins] = await Promise.all([
    prisma.arenaRun.findFirst({ where: { userId: me.id, status: { not: "DONE" } } }),
    prisma.arenaRun.count({ where: { userId: me.id, paid: false, createdAt: { gte: parisDayStart() } } }),
    prisma.arenaRun.findFirst({ where: { userId: me.id, status: "DONE" }, orderBy: { endedAt: "desc" } }),
    // Meilleure partie de la semaine de chaque joueur
    prisma.arenaRun.groupBy({ by: ["userId"], where: { status: "DONE", endedAt: { gte: weekStart } }, _max: { wins: true }, orderBy: { _max: { wins: "desc" } }, take: 10 }),
    prisma.user.findUnique({ where: { id: me.id }, select: { coins: true } }),
  ]);
  const ids = [...new Set([...(run?.picks ?? []), ...(run?.offer ?? [])])];
  const cards = ids.length
    ? await prisma.card.findMany({ where: { id: { in: ids } }, include: { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } } })
    : [];
  const view = new Map(cards.map((c) => [c.id, toCardView(c)]));
  const names = await prisma.user.findMany({ where: { id: { in: best.map((b) => b.userId) } }, select: { id: true, name: true } });
  const nameOf = new Map(names.map((n) => [n.id, n.name]));

  return (
    <section className="arena">
      <div className="page-head">
        <h1>🏟️ Arène</h1>
        <Link href="/duels" className="btn btn-ghost btn-sm">
          ⚔ Duels
        </Link>
      </div>
      <details className="how">
        <summary>Comment ça marche ?</summary>
        <p className="muted">
        Choisis 5 cartes parmi celles qu&apos;on te propose (pas besoin de les posséder), puis enchaîne les combats contre des adversaires
        de plus en plus forts. La partie s&apos;arrête à {ARENA_MAX_WINS} victoires ou {ARENA_MAX_LOSSES} défaites. Toutes les cartes sont au
        niveau ★1 : tout le monde est à égalité.
        </p>
      </details>
      <ArenaGame
        run={
          run
            ? {
                id: run.id,
                status: run.status as "DRAFT" | "FIGHT",
                picks: run.picks.map((id) => view.get(id)).filter((c) => !!c) as NonNullable<ReturnType<typeof view.get>>[],
                offer: run.offer.map((id) => view.get(id)).filter((c) => !!c) as NonNullable<ReturnType<typeof view.get>>[],
                wins: run.wins,
                losses: run.losses,
                lastLog: (run.lastLog as unknown as DuelLog) ?? null,
                lastNames: (run.lastNames as [string, string]) ?? null,
              }
            : null
        }
        freeAvailable={freeUsed === 0}
        entryCost={ARENA_ENTRY_COST}
        coins={coins?.coins ?? 0}
        maxWins={ARENA_MAX_WINS}
        maxLosses={ARENA_MAX_LOSSES}
        rewards={ARENA_REWARDS.map(rewardLabel)}
        lastResult={last ? { wins: last.wins, reward: (last.reward as { coins: number; boosters: number; cardName?: string | null } | null) ?? null } : null}
      />
      <div className="lobby-cols">
        <div className="panel">
          <h2>Récompenses</h2>
          <ol className="arena-rewards" start={0}>
            {ARENA_REWARDS.map((r, i) => (
              <li key={i}>
                <b>
                  {i} victoire{i > 1 ? "s" : ""}
                </b>
                <span>{rewardLabel(r)}</span>
              </li>
            ))}
          </ol>
          <p className="muted small-text">
            Première partie du jour gratuite, puis {ARENA_ENTRY_COST} pièces la partie. Tu peux aussi t&apos;arrêter à tout moment pour encaisser.
          </p>
        </div>
        <div className="panel">
          <h2>Meilleurs de la semaine</h2>
          {best.length === 0 ? (
            <p className="muted">Personne n&apos;a encore terminé de partie cette semaine.</p>
          ) : (
            <ol className="duel-top">
              {best.map((b, i) => (
                <li key={b.userId} className={b.userId === me.id ? "me" : ""}>
                  <span className="rank">{i + 1}</span>
                  <span>{nameOf.get(b.userId)}</span>
                  <span className="muted">
                    {b._max.wins} victoire{(b._max.wins ?? 0) > 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
