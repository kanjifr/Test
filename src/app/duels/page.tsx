import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { badgeView } from "@/lib/achievements";
import { BEATS, WHY } from "@/lib/duel";
import { ELEMENTS } from "@/lib/game";
import {
  DUEL_DAILY_LIMIT,
  DUEL_DAILY_REWARD,
  DUEL_SAME_OPPONENT_LIMIT,
  DUEL_TEAM_SIZE,
  ownedFighters,
  parisDayStart,
} from "@/lib/duel-server";
import { DuelLobby } from "@/components/DuelLobby";
import { NameWithBadge } from "@/components/Badge";

export const dynamic = "force-dynamic";

export default async function DuelsPage({ searchParams }: { searchParams: Promise<{ adversaire?: string }> }) {
  const me = await requireUser();
  const { adversaire } = await searchParams;
  const since = parisDayStart();
  const [cards, user, members, todayDuels, rewardedToday, history, top] = await Promise.all([
    ownedFighters(me.id),
    prisma.user.findUnique({ where: { id: me.id }, select: { defenseTeam: true, duelWins: true, duelLosses: true } }),
    prisma.user.findMany({
      where: { id: { not: me.id } },
      select: {
        id: true,
        name: true,
        image: true,
        duelWins: true,
        duelLosses: true,
        featuredBadge: true,
        _count: { select: { cards: { where: { card: { active: true } } } } },
      },
      orderBy: { duelWins: "desc" },
    }),
    prisma.duel.findMany({ where: { attackerId: me.id, defenderId: { not: null }, createdAt: { gte: since } }, select: { defenderId: true } }),
    prisma.duel.count({ where: { attackerId: me.id, rewarded: true, createdAt: { gte: since } } }),
    prisma.duel.findMany({
      where: { OR: [{ attackerId: me.id }, { defenderId: me.id }] },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { attacker: { select: { name: true } }, defender: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: { duelWins: { gt: 0 } },
      orderBy: [{ duelWins: "desc" }, { duelLosses: "asc" }],
      take: 10,
      select: { id: true, name: true, duelWins: true, duelLosses: true, featuredBadge: true },
    }),
  ]);
  const fought = new Map<string, number>();
  for (const d of todayDuels) fought.set(d.defenderId!, (fought.get(d.defenderId!) ?? 0) + 1);
  const opponents = members
    .filter((m) => m._count.cards >= DUEL_TEAM_SIZE)
    .map((m) => ({
      id: m.id,
      name: m.name,
      image: m.image,
      wins: m.duelWins,
      losses: m.duelLosses,
      badge: badgeView(m.featuredBadge),
      foughtToday: fought.get(m.id) ?? 0,
    }));

  const outcome = (d: (typeof history)[number]) => {
    if (d.result === "DRAW") return { label: "Nul", cls: "draw" };
    const won = (d.result === "ATTACKER") === (d.attackerId === me.id);
    return won ? { label: "Victoire", cls: "win" } : { label: "Défaite", cls: "loss" };
  };

  return (
    <section className="duels">
      <div className="page-head">
        <h1>⚔ Duels</h1>
        <span className="muted">
          Ton palmarès : <b>{user?.duelWins ?? 0}</b> victoire(s) · <b>{user?.duelLosses ?? 0}</b> défaite(s)
        </span>
      </div>

      <DuelLobby
        cards={cards}
        defense={user?.defenseTeam ?? []}
        opponents={opponents}
        teamSize={DUEL_TEAM_SIZE}
        duelsLeft={Math.max(0, DUEL_DAILY_LIMIT - todayDuels.length)}
        sameOpponentLimit={DUEL_SAME_OPPONENT_LIMIT}
        rewardAvailable={DUEL_DAILY_REWARD > 0 && rewardedToday === 0}
        highlight={adversaire ?? null}
      />

      <div className="lobby-cols">
        <div className="panel">
          <h2>Derniers combats</h2>
          {history.length === 0 ? (
            <p className="muted">Aucun combat pour le moment.</p>
          ) : (
            <ul className="duel-history">
              {history.map((d) => {
                const o = outcome(d);
                const vs = d.defenderId === null ? "Entraînement" : d.attackerId === me.id ? `contre ${d.defender?.name}` : `${d.attacker.name} t'a défié`;
                return (
                  <li key={d.id}>
                    <span className={`result ${o.cls}`}>{o.label}</span>
                    <span className="duel-vs">
                      {vs}
                      {d.rewarded && d.attackerId === me.id ? " 🎁" : ""}
                    </span>
                    <time className="muted">
                      {d.createdAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}
                    </time>
                    <Link href={`/duels/${d.id}`}>Revoir</Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="panel">
          <h2>Classement des duellistes</h2>
          {top.length === 0 ? (
            <p className="muted">Personne n&apos;a encore gagné de duel.</p>
          ) : (
            <ol className="duel-top">
              {top.map((t, i) => (
                <li key={t.id} className={t.id === me.id ? "me" : ""}>
                  <span className="rank">{i + 1}</span>
                  <NameWithBadge name={t.name} badge={badgeView(t.featuredBadge)} />
                  <span className="muted">
                    {t.duelWins} V · {t.duelLosses} D
                  </span>
                </li>
              ))}
            </ol>
          )}
          <h3>Les éléments</h3>
          <ul className="elements-chart">
            {Object.entries(BEATS).map(([a, b]) => (
              <li key={a}>
                <span style={{ color: ELEMENTS[a as keyof typeof ELEMENTS].color }}>{ELEMENTS[a as keyof typeof ELEMENTS].label}</span>
                {" > "}
                <span style={{ color: ELEMENTS[b as keyof typeof ELEMENTS].color }}>{ELEMENTS[b as keyof typeof ELEMENTS].label}</span>
                <small className="muted"> · {WHY[a]}</small>
              </li>
            ))}
          </ul>
          <p className="muted small-text">
            Avantage : ×1,3 de dégâts. Désavantage : ×0,8. L&apos;ATK augmente les dégâts, la DEF les réduit et ajoute des
            points de vie. Coups critiques et esquives pimentent le tout.
          </p>
        </div>
      </div>
    </section>
  );
}
