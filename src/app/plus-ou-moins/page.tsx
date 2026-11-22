import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { weekEnd } from "@/lib/quests";
import { HighLowGame } from "@/components/HighLowGame";
import { HL_BOOSTER_AT, HL_COINS_MAX, HL_COINS_PER } from "@/lib/highlow";

export const dynamic = "force-dynamic";

export default async function HighLowPage() {
  const me = await requireUser();
  const weekStart = new Date(weekEnd().getTime() - 7 * 86400_000);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [best, record, rewardedToday] = await Promise.all([
    prisma.highLowRun.groupBy({ by: ["userId"], where: { done: true, endedAt: { gte: weekStart } }, _max: { streak: true }, orderBy: { _max: { streak: "desc" } }, take: 10 }),
    prisma.highLowRun.aggregate({ where: { userId: me.id, done: true }, _max: { streak: true } }),
    prisma.highLowRun.count({ where: { userId: me.id, day, rewarded: true, done: true } }),
  ]);
  const names = await prisma.user.findMany({ where: { id: { in: best.map((b) => b.userId) } }, select: { id: true, name: true } });
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  return (
    <section className="highlow">
      <div className="page-head">
        <h1>🔼 Plus ou moins</h1>
        <Link href="/arene" className="btn btn-ghost btn-sm">
          🏟️ Arène
        </Link>
      </div>
      <details className="how">
        <summary>Comment ça marche ?</summary>
        <p className="muted">
        La prochaine carte aura-t-elle <b>plus</b> ou <b>moins</b> d&apos;ATK ? Enchaîne les bonnes réponses (une égalité compte comme gagnée).
        La première partie du jour rapporte {HL_COINS_PER} pièces par bonne réponse (jusqu&apos;à {HL_COINS_MAX}), et un booster bonus dès une
        série de {HL_BOOSTER_AT}. Les parties suivantes sont pour le plaisir… et le classement !
        </p>
      </details>
      <HighLowGame record={record._max.streak ?? 0} rewardedDone={rewardedToday > 0} />
      <div className="panel">
        <h2>Meilleures séries de la semaine</h2>
        {best.length === 0 ? (
          <p className="muted">Personne n&apos;a encore joué cette semaine.</p>
        ) : (
          <ol className="duel-top">
            {best.map((b, i) => (
              <li key={b.userId} className={b.userId === me.id ? "me" : ""}>
                <span className="rank">{i + 1}</span>
                <span>{nameOf.get(b.userId)}</span>
                <span className="muted">série de {b._max.streak}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
