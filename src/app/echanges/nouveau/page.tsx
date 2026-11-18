import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toCardView } from "@/lib/cards";
import { expireTrades, tradableCards } from "@/lib/trades";
import { TradeBuilder } from "@/components/TradeBuilder";

export const dynamic = "force-dynamic";

export default async function NewTrade({
  searchParams,
}: {
  searchParams: Promise<{ avec?: string; contre?: string }>;
}) {
  const me = await requireUser();
  const { avec, contre } = await searchParams;
  await expireTrades();

  // Contre-proposition : on reprend la proposition reçue en inversant les côtés
  const parent = contre
    ? await prisma.trade.findFirst({
        where: { id: contre, toId: me.id, status: "PENDING" },
        include: { items: true },
      })
    : null;
  const otherId = parent?.fromId ?? avec;
  if (!otherId || otherId === me.id) {
    return <p className="error">Choisis un membre depuis le <Link href="/classement">classement</Link> pour lui proposer un échange.</p>;
  }
  const other = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true, name: true } });
  if (!other) return <p className="error">Membre introuvable.</p>;

  const [mine, theirs] = await Promise.all([tradableCards(me.id), tradableCards(other.id)]);
  const pick = (side: "OFFER" | "REQUEST", allowed: Set<string>) =>
    Object.fromEntries(
      (parent?.items ?? [])
        .map((i) => ({ ...i, key: `${i.cardId}${i.shiny ? ":s" : ""}` }))
        .filter((i) => i.side === side && allowed.has(i.key))
        .map((i) => [i.key, i.quantity]),
    );
  const keyOf = (t: { card: { id: string }; shiny: boolean }) => `${t.card.id}${t.shiny ? ":s" : ""}`;
  const mineIds = new Set(mine.map(keyOf));
  const theirIds = new Set(theirs.map(keyOf));

  return (
    <section>
      <div className="page-head">
        <h1>{parent ? `Contre-proposition à ${other.name}` : `Échange avec ${other.name}`}</h1>
        <Link href="/echanges">← Mes échanges</Link>
      </div>
      <TradeBuilder
        toId={other.id}
        toName={other.name ?? "ce membre"}
        mine={mine.map((m) => ({ card: { ...toCardView(m.card), shiny: m.shiny }, available: m.available, total: m.total, shiny: m.shiny }))}
        theirs={theirs.map((t) => ({ card: { ...toCardView(t.card), shiny: t.shiny }, available: t.available, total: t.total, shiny: t.shiny }))}
        parentId={parent?.id}
        // Ce que l'autre me demandait = ce que je donne ; ce qu'il m'offrait = ce que je reçois
        initialOffer={pick("REQUEST", mineIds)}
        initialRequest={pick("OFFER", theirIds)}
      />
    </section>
  );
}
