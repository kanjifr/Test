import Link from "next/link";
import type { TradeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { expireTrades, MAX_PENDING_SENT, tradeInclude, type TradeWithItems } from "@/lib/trades";
import { TradeSummary } from "@/components/TradeSummary";
import { acceptTrade, cancelTrade, declineTrade } from "./actions";

export const dynamic = "force-dynamic";

const STATUS: Record<TradeStatus, string> = {
  PENDING: "En attente",
  ACCEPTED: "✔ Accepté",
  DECLINED: "Refusé",
  COUNTERED: "Contre-proposition envoyée",
  CANCELLED: "Annulé",
  EXPIRED: "Expiré",
  FAILED: "Échoué (cartes plus disponibles)",
};

function timeLeft(d: Date) {
  const h = Math.max(0, Math.round((d.getTime() - Date.now()) / 3600_000));
  return h >= 1 ? `expire dans ${h} h` : "expire bientôt";
}

export default async function TradesPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const me = await requireUser();
  const { sent } = await searchParams;
  await expireTrades();

  const [incoming, outgoing, history] = await Promise.all([
    prisma.trade.findMany({ where: { toId: me.id, status: "PENDING" }, include: tradeInclude, orderBy: { createdAt: "desc" } }),
    prisma.trade.findMany({ where: { fromId: me.id, status: "PENDING" }, include: tradeInclude, orderBy: { createdAt: "desc" } }),
    prisma.trade.findMany({
      where: { OR: [{ fromId: me.id }, { toId: me.id }], status: { not: "PENDING" } },
      include: tradeInclude,
      orderBy: { resolvedAt: "desc" },
      take: 20,
    }),
  ]);

  const block = (t: TradeWithItems, actions: React.ReactNode, meta: string) => (
    <div key={t.id} className="panel trade">
      <div className="trade-head">
        <b>{t.fromId === me.id ? `À ${t.to.name}` : `De ${t.from.name}`}</b>
        <span className="muted">{meta}</span>
      </div>
      <TradeSummary trade={t} />
      {actions && <div className="row trade-actions">{actions}</div>}
    </div>
  );

  return (
    <section className="trades">
      <h1>Échanges</h1>
      {sent && <p className="success">Proposition envoyée ✔</p>}
      <p className="muted">
        Pour proposer un échange, ouvre la collection d&apos;un membre depuis le <Link href="/classement">classement</Link>.
      </p>

      <h2>Reçus ({incoming.length})</h2>
      {incoming.length === 0 && <p className="muted">Aucune proposition reçue.</p>}
      {incoming.map((t) =>
        block(
          t,
          <>
            <form action={acceptTrade}>
              <input type="hidden" name="id" value={t.id} />
              <button className="btn">Accepter</button>
            </form>
            <Link href={`/echanges/nouveau?contre=${t.id}`} className="btn btn-ghost">
              Contre-proposer
            </Link>
            <form action={declineTrade}>
              <input type="hidden" name="id" value={t.id} />
              <button className="btn btn-danger">Refuser</button>
            </form>
          </>,
          timeLeft(t.expiresAt),
        ),
      )}

      <h2>
        Envoyés ({outgoing.length}/{MAX_PENDING_SENT})
      </h2>
      {outgoing.length === 0 && <p className="muted">Aucune proposition en attente.</p>}
      {outgoing.map((t) =>
        block(
          t,
          <form action={cancelTrade}>
            <input type="hidden" name="id" value={t.id} />
            <button className="btn btn-ghost">Annuler</button>
          </form>,
          timeLeft(t.expiresAt),
        ),
      )}

      {history.length > 0 && (
        <>
          <h2>Historique</h2>
          {history.map((t) =>
            block(t, null, `${STATUS[t.status]} · ${(t.resolvedAt ?? t.createdAt).toLocaleDateString("fr-FR")}`),
          )}
        </>
      )}
    </section>
  );
}
