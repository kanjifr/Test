import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toCardView } from "@/lib/cards";
import { CardGrid, type GridItem } from "@/components/CardGrid";
import { RARITIES, RARITY_ORDER } from "@/lib/game";
import { badgeView } from "@/lib/achievements";
import { NameWithBadge } from "@/components/Badge";
import { boosted } from "@/lib/evolution";

export const dynamic = "force-dynamic";

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const me = await requireUser();
  const { u } = await searchParams;
  const ownerId = u || me.id;

  const [owner, cards, owned, series] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, name: true, featuredBadge: true } }),
    prisma.card.findMany({
      where: { active: true },
      orderBy: { number: "asc" },
      include: { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } },
    }),
    prisma.userCard.findMany({ where: { userId: ownerId } }),
    prisma.series.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, inBoosters: true } }),
  ]);
  if (!owner) return <p className="error">Membre introuvable.</p>;

  const rows = new Map(owned.map((o) => [o.cardId, o]));
  // Une carte possédée en version brillante s'affiche brillante
  const items: GridItem[] = cards.map((c) => {
    const o = rows.get(c.id);
    const v = toCardView(c);
    const level = o?.level ?? 1;
    return {
      card: { ...v, shiny: (o?.shiny ?? 0) > 0, level, attack: boosted(v.attack, level), defense: boosted(v.defense, level) },
      base: { attack: v.attack, defense: v.defense },
      count: o?.count ?? 0,
      shiny: o?.shiny ?? 0,
      seriesId: c.seriesId,
    };
  });
  const shinyTotal = owned.filter((o) => o.shiny > 0).length;
  const have = items.filter((i) => i.count > 0).length;
  const pct = cards.length ? Math.round((have / cards.length) * 100) : 0;
  const isMe = owner.id === me.id;
  // Progression par série (seulement les séries qui ont des cartes)
  const perSeries = series
    .map((x) => {
      const list = items.filter((i) => i.seriesId === x.id);
      return { ...x, total: list.length, got: list.filter((i) => i.count > 0).length };
    })
    .filter((x) => x.total > 0);

  const doubles = owned.reduce((n, o) => n + Math.max(0, o.count - 1), 0);
  const maxed = owned.filter((o) => o.level >= 5).length;
  const rarityStats = RARITY_ORDER.map((r) => {
    const total = items.filter((i) => i.card.rarity === r).length;
    const got = items.filter((i) => i.card.rarity === r && i.count > 0).length;
    return { r, total, got };
  }).filter((x) => x.total > 0);

  return (
    <section className="collection-page">
      <header className="panel album-hero">
        <div className="album-ring" style={{ "--p": pct } as React.CSSProperties} role="img" aria-label={`${have} cartes sur ${cards.length}`}>
          <b>{pct}%</b>
          <span>
            {have}/{cards.length}
          </span>
        </div>
        <div className="album-info">
          <div className="album-title">
            <h1>
              {isMe ? (
                "Ma collection"
              ) : (
                <>
                  Collection de <NameWithBadge name={owner.name} badge={badgeView(owner.featuredBadge)} />
                </>
              )}
            </h1>
            <div className="row album-actions">
              {isMe ? (
                <>
                  <Link href="/recyclage" className="btn btn-ghost btn-sm">
                    ♻ Recycler
                  </Link>
                  <Link href="/boutique" className="btn btn-ghost btn-sm">
                    🪙 Boutique
                  </Link>
                </>
              ) : (
                <>
                  <Link href={`/echanges/nouveau?avec=${owner.id}`} className="btn btn-sm">
                    ⇄ Proposer un échange
                  </Link>
                  <Link href="/collection" className="btn btn-ghost btn-sm">
                    ← Ma collection
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="album-rarities">
            {rarityStats.map(({ r, total, got }) => (
              <div key={r} className={`album-rar ${got === total ? "done" : ""}`} style={{ "--rc": RARITIES[r].color } as React.CSSProperties}>
                <span className="album-rar-label">{RARITIES[r].label}</span>
                <b>
                  {got}/{total}
                </b>
                <span className="album-rar-bar">
                  <i style={{ width: `${(got / total) * 100}%` }} />
                </span>
              </div>
            ))}
          </div>
          <div className="album-meta">
            <span className="album-pill shiny-pill">
              ✦ {shinyTotal}/{cards.length} brillante{shinyTotal > 1 ? "s" : ""}
            </span>
            {maxed > 0 && <span className="album-pill">★5 × {maxed}</span>}
            <span className="album-pill">
              {doubles} doublon{doubles > 1 ? "s" : ""}
            </span>
            {cards.length > 0 && shinyTotal >= cards.length && <span className="album-pill gold">Collection brillante complète !</span>}
          </div>
        </div>
      </header>

      {perSeries.length > 1 && (
        <div className="series-strip" role="list" aria-label="Progression par série">
          {perSeries.map((x) => {
            const p = Math.round((x.got / x.total) * 100);
            return (
              <div key={x.id} role="listitem" className={`series-chip ${x.got === x.total ? "done" : ""}`}>
                <span className="series-name">
                  {x.name}
                  {!x.inBoosters && <small className="muted"> · hors boosters</small>}
                </span>
                <span className="series-count">{x.got === x.total ? "✓" : `${x.got}/${x.total}`}</span>
                <span className="series-bar">
                  <span style={{ width: `${p}%` }} />
                </span>
              </div>
            );
          })}
        </div>
      )}
      {cards.length === 0 ? (
        <p className="muted">Aucune carte pour le moment.</p>
      ) : (
        <CardGrid items={items} series={perSeries.map(({ id, name }) => ({ id, name }))} canEvolve={isMe} />
      )}
    </section>
  );
}
