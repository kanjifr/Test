import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ownedFighters } from "@/lib/duel-server";
import { DEST_BY_ID, destinationsOfDay, DURATIONS, EXPEDITION_TEAM, type ExpeditionReward } from "@/lib/expeditions";
import { ExpeditionBoard, type ActiveExp } from "@/components/ExpeditionBoard";

export const dynamic = "force-dynamic";

export default async function ExpeditionsPage() {
  const me = await requireUser();
  const [cards, active, history] = await Promise.all([
    ownedFighters(me.id),
    prisma.expedition.findMany({ where: { userId: me.id, claimedAt: null }, orderBy: { startedAt: "asc" } }),
    prisma.expedition.findMany({ where: { userId: me.id, claimedAt: { not: null } }, orderBy: { claimedAt: "desc" }, take: 8 }),
  ]);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const activeView: ActiveExp[] = active.map((e) => ({
    id: e.id,
    destination: DEST_BY_ID.get(e.destination)!,
    hours: e.hours,
    startedAt: e.startedAt.getTime(),
    endsAt: e.endsAt.getTime(),
    cards: e.cardIds.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c),
  }));
  return (
    <section className="expeditions">
      <div className="page-head">
        <h1>🧭 Expéditions</h1>
      </div>
      <p className="muted">
        Envoie {EXPEDITION_TEAM} cartes explorer une destination. Plus le voyage est long, plus le butin est gros : des pièces, et parfois une
        carte ou un booster. Les cartes du bon élément et les cartes évoluées ramènent davantage. Pendant le voyage, elles ne peuvent pas
        attaquer (mais elles défendent toujours).
      </p>
      <ExpeditionBoard
        destinations={destinationsOfDay()}
        durations={DURATIONS}
        cards={cards}
        active={activeView}
        serverNow={Date.now()}
      />
      {history.length > 0 && (
        <div className="panel">
          <h2>Derniers voyages</h2>
          <ul className="exp-history">
            {history.map((h) => {
              const r = h.reward as unknown as ExpeditionReward;
              const d = DEST_BY_ID.get(h.destination);
              const recalled = r.factor === 0;
              return (
                <li key={h.id}>
                  <span className="exp-kanji" aria-hidden>
                    {d?.kanji}
                  </span>
                  <span>
                    <b>{d?.name}</b> <span className="muted small-text">· {h.hours} h</span>
                  </span>
                  <span className="small-text">
                    {recalled ? <span className="muted">Rappelée</span> : <>🪙 {r.coins}{r.cardId ? " · 🃏 carte" : ""}{r.booster ? " · 🎁 booster" : ""}</>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
