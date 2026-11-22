import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import type { DuelLog } from "@/lib/duel";
import { DuelReplay } from "@/components/DuelReplay";

export const dynamic = "force-dynamic";

export default async function DuelPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const duel = await prisma.duel.findUnique({
    where: { id },
    include: { attacker: { select: { id: true, name: true } }, defender: { select: { id: true, name: true } }, tournament: { select: { id: true, name: true } } },
  });
  if (!duel) notFound();
  const log = duel.log as unknown as DuelLog;
  const names: [string, string] = [duel.attacker.name ?? "?", duel.defender?.name ?? "Entraînement"];
  const viewerSide = duel.attackerId === me.id ? 0 : duel.defenderId === me.id ? 1 : null;
  const rematchId = duel.tournament ? null : viewerSide === 0 ? duel.defenderId : viewerSide === 1 ? duel.attackerId : null;
  return (
    <section>
      <div className="page-head">
        <h1>⚔ {names[0]} contre {names[1]}</h1>
        {duel.tournament ? <Link href={`/tournois/${duel.tournament.id}`}>← {duel.tournament.name}</Link> : <Link href="/duels">← Duels</Link>}
      </div>
      <DuelReplay log={log} names={names} viewerSide={viewerSide} rewarded={duel.rewarded} rematchId={rematchId} />
    </section>
  );
}
