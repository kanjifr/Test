import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toCardView } from "@/lib/cards";
import { CardGrid, type GridItem } from "@/components/CardGrid";
import { RARITIES, RARITY_ORDER } from "@/lib/game";
import { badgeView } from "@/lib/achievements";
import { NameWithBadge } from "@/components/Badge";

export const dynamic = "force-dynamic";

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const me = await requireUser();
  const { u } = await searchParams;
  const ownerId = u || me.id;

  const [owner, cards, owned] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, name: true, featuredBadge: true } }),
    prisma.card.findMany({
      where: { active: true },
      orderBy: { number: "asc" },
      include: { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } },
    }),
    prisma.userCard.findMany({ where: { userId: ownerId } }),
  ]);
  if (!owner) return <p className="error">Membre introuvable.</p>;

  const counts = new Map(owned.map((o) => [o.cardId, o.count]));
  const items: GridItem[] = cards.map((c) => ({ card: toCardView(c), count: counts.get(c.id) ?? 0 }));
  const have = items.filter((i) => i.count > 0).length;
  const pct = cards.length ? Math.round((have / cards.length) * 100) : 0;
  const isMe = owner.id === me.id;

  return (
    <section>
      <div className="page-head">
        <h1>
          {isMe ? (
            "Ma collection"
          ) : (
            <>
              Collection de <NameWithBadge name={owner.name} badge={badgeView(owner.featuredBadge)} />
            </>
          )}
        </h1>
        {isMe && (
          <Link href="/recyclage" className="btn btn-ghost btn-sm">
            ♻ Recycler mes doublons
          </Link>
        )}
        {!isMe && (
          <div className="row">
            <Link href={`/echanges/nouveau?avec=${owner.id}`} className="btn">
              ⇄ Proposer un échange
            </Link>
            <Link href="/collection">← Ma collection</Link>
          </div>
        )}
      </div>
      <div className="progress">
        <div className="progress-bar" style={{ width: `${pct}%` }} />
        <span>
          {have} / {cards.length} cartes · {pct}%
        </span>
      </div>
      <div className="rarity-summary">
        {RARITY_ORDER.map((r) => {
          const total = items.filter((i) => i.card.rarity === r).length;
          const got = items.filter((i) => i.card.rarity === r && i.count > 0).length;
          return (
            <span key={r} style={{ color: RARITIES[r].color }}>
              {RARITIES[r].label} {got}/{total}
            </span>
          );
        })}
      </div>
      {cards.length === 0 ? <p className="muted">Aucune carte pour le moment.</p> : <CardGrid items={items} />}
    </section>
  );
}
