import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toCardView } from "@/lib/cards";
import { RECYCLE_COST } from "@/lib/game";
import { Recycler } from "@/components/Recycler";

export const dynamic = "force-dynamic";

export default async function RecyclePage() {
  const me = await requireUser();
  const [user, dupes] = await Promise.all([
    prisma.user.findUnique({ where: { id: me.id }, select: { bonusPacks: true, recycledCount: true } }),
    prisma.userCard.findMany({
      where: { userId: me.id, count: { gte: 2 }, card: { active: true } },
      include: { card: { include: { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } } } },
    }),
  ]);
  return (
    <section>
      <div className="page-head">
        <h1>♻ Recyclage</h1>
        <Link href="/collection">← Ma collection</Link>
      </div>
      <p className="lead left">
        Recycle <b>{RECYCLE_COST} doublons</b> pour gagner <b>1 booster bonus</b>, à ouvrir tout de suite sans attendre. Tu
        gardes toujours au moins un exemplaire de chaque carte.
        {user?.recycledCount ? ` Tu as déjà recyclé ${user.recycledCount} doublons.` : ""}
      </p>
      <Recycler
        cost={RECYCLE_COST}
        initialBonus={user?.bonusPacks ?? 0}
        items={dupes.map((d) => ({ card: toCardView(d.card), extra: d.count - 1 }))}
      />
    </section>
  );
}
