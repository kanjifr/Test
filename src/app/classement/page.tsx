import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { badgeView } from "@/lib/achievements";
import { NameWithBadge } from "@/components/Badge";

export const dynamic = "force-dynamic";

export default async function Leaderboard() {
  const me = await requireUser();
  const [total, users] = await Promise.all([
    prisma.card.count({ where: { active: true } }),
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        image: true,
        packsOpened: true,
        featuredBadge: true,
        _count: { select: { cards: { where: { card: { active: true } } }, achievements: true } },
      },
    }),
  ]);
  const ranked = users
    .map((u) => ({ ...u, unique: u._count.cards }))
    .sort((a, b) => b.unique - a.unique || b.packsOpened - a.packsOpened)
    .slice(0, 50);

  return (
    <section>
      <h1>Classement</h1>
      <ol className="board">
        {ranked.map((u, i) => (
          <li key={u.id} className={u.id === me.id ? "me" : ""}>
            <span className="rank">{i + 1}</span>
            {u.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.image} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar-fallback">{u.name?.[0] ?? "?"}</span>
            )}
            <Link href={`/membre/${u.id}`} className="board-name">
              <NameWithBadge name={u.name} badge={badgeView(u.featuredBadge)} />
            </Link>
            <span className="muted board-meta">
              {u.packsOpened} boosters · {u._count.achievements} succès
            </span>
            <b>
              {u.unique}/{total}
            </b>
          </li>
        ))}
      </ol>
    </section>
  );
}
