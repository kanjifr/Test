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
      (parent?.items ?? []).filter((i) => i.side === side && allowed.has(i.cardId)).map((i) => [i.cardId, i.quantity]),
    );
  const mineIds = new Set(mine.map((m) => m.card.id));
  const theirIds = new Set(theirs.map((t) => t.card.id));

  return (
    <section>
      <div className="page-head">
        <h1>{parent ? `Contre-proposition à ${other.name}` : `Échange avec ${other.name}`}</h1>
        <Link href="/echanges">← Mes échanges</Link>
      </div>
      <TradeBuilder
        toId={other.id}
        toName={other.name ?? "ce membre"}
        mine={mine.map((m) => ({ card: toCardView(m.card), available: m.available }))}
        theirs={theirs.map((t) => ({ card: toCardView(t.card), available: t.available }))}
        parentId={parent?.id}
        // Ce que l'autre me demandait = ce que je donne ; ce qu'il m'offrait = ce que je reçois
        initialOffer={pick("REQUEST", mineIds)}
        initialRequest={pick("OFFER", theirIds)}
      />
    </section>
  );
}
