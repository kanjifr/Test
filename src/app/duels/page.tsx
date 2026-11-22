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
import { deMonth, MEDALS, monthKey, monthRange, myMonthDuels, previousMonth, SEASON_REWARDS, seasonRanking } from "@/lib/seasons";
import { MIN_SEASON_DUELS, preview, tierOf } from "@/lib/elo";
import { cardsAway } from "@/lib/expeditions-server";

export const dynamic = "force-dynamic";

export default async function DuelsPage({ searchParams }: { searchParams: Promise<{ adversaire?: string }> }) {
  const me = await requireUser();
  const { adversaire } = await searchParams;
  const since = parisDayStart();
  const [cards, user, members, todayDuels, rewardedToday, history, top] = await Promise.all([
    ownedFighters(me.id),
    prisma.user.findUnique({ where: { id: me.id }, select: { defenseTeam: true, duelWins: true, duelLosses: true, duelRating: true, duelPeak: true } }),
    prisma.user.findMany({
      where: { id: { not: me.id } },
      select: {
        id: true,
        name: true,
        image: true,
        duelWins: true,
        duelLosses: true,
        duelRating: true,
        featuredBadge: true,
        _count: { select: { cards: { where: { card: { active: true } } } } },
      },
      orderBy: { duelWins: "desc" },
    }),
    prisma.duel.findMany({ where: { attackerId: me.id, defenderId: { not: null }, tournamentId: null, createdAt: { gte: since } }, select: { defenderId: true } }),
    prisma.duel.count({ where: { attackerId: me.id, rewarded: true, createdAt: { gte: since } } }),
    prisma.duel.findMany({
      where: { OR: [{ attackerId: me.id }, { defenderId: me.id }] },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { attacker: { select: { name: true } }, defender: { select: { name: true } }, tournament: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: { duelWins: { gt: 0 } },
      orderBy: [{ duelWins: "desc" }, { duelLosses: "asc" }],
      take: 10,
      select: { id: true, name: true, duelWins: true, duelLosses: true, featuredBadge: true },
    }),
  ]);
  const openTournaments = await prisma.tournament.findMany({
    where: { status: "REGISTRATION" },
    orderBy: { startsAt: "asc" },
    select: { id: true, name: true, startsAt: true, entries: { where: { userId: me.id }, select: { userId: true } } },
  });
  const season = monthKey();
  const [seasonTop, lastPodium, myDuels] = await Promise.all([
    seasonRanking(season, 10),
    prisma.seasonAward.findMany({
      where: { kind: "DUEL_MONTH", period: previousMonth(season) },
      orderBy: { rank: "asc" },
      include: { user: { select: { id: true, name: true, featuredBadge: true } } },
    }),
    myMonthDuels(me.id, season),
  ]);
  const away = [...(await cardsAway(me.id))];
  const myRating = user?.duelRating ?? 1000;
  const myTier = tierOf(myRating);
  const seasonEnd = monthRange(season)[1];
  const daysLeft = Math.max(1, Math.ceil((seasonEnd.getTime() - Date.now()) / 86400_000));
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
      rating: m.duelRating,
      tier: tierOf(m.duelRating),
      stakes: preview(myRating, m.duelRating),
      badge: badgeView(m.featuredBadge),
      foughtToday: fought.get(m.id) ?? 0,
    }))
    // Les adversaires de ton niveau d'abord
    .sort((a, b) => Math.abs(a.rating - myRating) - Math.abs(b.rating - myRating));

  const outcome = (d: (typeof history)[number]) => {
    if (d.result === "DRAW") return { label: "Nul", cls: "draw" };
    const won = (d.result === "ATTACKER") === (d.attackerId === me.id);
    return won ? { label: "Victoire", cls: "win" } : { label: "Défaite", cls: "loss" };
  };

  return (
    <section className="duels">
      <div className="page-head">
        <h1>⚔ Duels</h1>
        <span className="row">
          <Link href="/arene" className="btn btn-ghost btn-sm">
            🏟️ Arène
          </Link>
          <Link href="/tournois" className="btn btn-ghost btn-sm">
            🏆 Tournois
          </Link>
        </span>
        <div className="my-rating" style={{ "--tc": myTier.color } as React.CSSProperties}>
          <span className="tier-medal" aria-hidden>
            {myTier.kanji}
          </span>
          <span>
            <b>{myRating}</b> <small>{myTier.label}</small>
            <small className="muted">
              {" "}
              · record {user?.duelPeak ?? myRating} · {user?.duelWins ?? 0} V / {user?.duelLosses ?? 0} D
            </small>
          </span>
        </div>
      </div>

      {openTournaments.map((t) => (
        <Link key={t.id} href="/tournois" className="panel tournament-banner">
          <b>🏆 {t.name}</b>
          <span>
            {t.startsAt.toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
            {" · "}
            {t.entries.length ? "✓ Tu es inscrit" : "Inscriptions ouvertes →"}
          </span>
        </Link>
      ))}

      <DuelLobby
        cards={cards}
        defense={user?.defenseTeam ?? []}
        opponents={opponents}
        teamSize={DUEL_TEAM_SIZE}
        duelsLeft={Math.max(0, DUEL_DAILY_LIMIT - todayDuels.length)}
        sameOpponentLimit={DUEL_SAME_OPPONENT_LIMIT}
        rewardAvailable={DUEL_DAILY_REWARD > 0 && rewardedToday === 0}
        highlight={adversaire ?? null}
        away={away}
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
                const vs = d.tournament ? `🏆 ${d.tournament.name} : ${d.attackerId === me.id ? `contre ${d.defender?.name}` : `contre ${d.attacker.name}`}` : d.defenderId === null ? "Entraînement" : d.attackerId === me.id ? `contre ${d.defender?.name}` : `${d.attacker.name} t'a défié`;
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
          <h2>⚔ Saison {deMonth(season)}</h2>
          <p className="muted small-text">
            Fin dans {daysLeft} jour{daysLeft > 1 ? "s" : ""}. Classement à la <b>cote</b> (au moins {MIN_SEASON_DUELS} duels dans le mois). Le podium
            gagne un titre et {SEASON_REWARDS.join(", ")} boosters bonus.{" "}
            {myDuels < MIN_SEASON_DUELS
              ? `Encore ${MIN_SEASON_DUELS - myDuels} duel${MIN_SEASON_DUELS - myDuels > 1 ? "s" : ""} pour être classé.`
              : "Tu es classé ce mois-ci !"}
          </p>
          {seasonTop.length === 0 ? (
            <p className="muted">Personne n&apos;est encore classé ce mois-ci. À toi de jouer !</p>
          ) : (
            <ol className="duel-top">
              {seasonTop.map((t, i) => (
                <li key={t.userId} className={t.userId === me.id ? "me" : ""}>
                  <span className="rank">{i < 3 ? MEDALS[i] : i + 1}</span>
                  <NameWithBadge name={t.name} badge={badgeView(t.featuredBadge)} />
                  <span className="muted">
                    <b style={{ color: tierOf(t.rating).color }}>{t.rating}</b> · {t.wins} V · {t.losses} D
                  </span>
                </li>
              ))}
            </ol>
          )}
          {lastPodium.length > 0 && (
            <p className="small-text last-podium">
              Podium {deMonth(previousMonth(season))} :{" "}
              {lastPodium.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && " · "}
                  {MEDALS[a.rank - 1]} <Link href={`/membre/${a.user.id}`}>{a.user.name}</Link>
                </span>
              ))}
            </p>
          )}
          <details className="all-time">
            <summary>Classement de tous les temps</summary>
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
          </details>
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
          <h3>La cote</h3>
          <p className="muted small-text">
            Chaque joueur a une cote (1000 au départ). Battre un adversaire plus fort rapporte beaucoup de points, battre un adversaire bien
            plus faible presque rien, et perdre contre lui en coûte beaucoup. Le défenseur gagne ou perd deux fois moins. Paliers : Bronze,
            Argent (1100), Or (1250), Platine (1400), Diamant (1550), Maître (1700). Chaque mois, les cotes se rapprochent de 1000.
          </p>
          <p className="muted small-text">
            Avantage : ×1,3 de dégâts. Désavantage : ×0,8. L&apos;ATK augmente les dégâts, la DEF les réduit et ajoute des
            points de vie. Coups critiques et esquives pimentent le tout.
          </p>
        </div>
      </div>
    </section>
  );
}
