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
import { MIN_SEASON_DUELS, preview, tierOf, TIERS_ELO } from "@/lib/elo";
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
    // Classement général : tous ceux qui ont déjà disputé un duel, par cote
    prisma.user.findMany({
      where: { OR: [{ duelWins: { gt: 0 } }, { duelLosses: { gt: 0 } }] },
      orderBy: [{ duelRating: "desc" }, { duelWins: "desc" }],
      take: 50,
      select: { id: true, name: true, image: true, duelWins: true, duelLosses: true, duelRating: true, duelPeak: true, featuredBadge: true },
    }),
  ]);
  const openTournaments = await prisma.tournament.findMany({
    where: { status: "REGISTRATION" },
    orderBy: { startsAt: "asc" },
    select: { id: true, name: true, startsAt: true, entries: { where: { userId: me.id }, select: { userId: true } } },
  });
  const season = monthKey();
  const [seasonTop, lastPodium, myDuels] = await Promise.all([
    seasonRanking(season, 100),
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

  // Progression vers le palier suivant
  const nextTier = TIERS_ELO.find((t) => t.min > myRating) ?? null;
  const tierPct = nextTier ? Math.round(((myRating - myTier.min) / (nextTier.min - myTier.min)) * 100) : 100;
  const mySeasonRank = seasonTop.findIndex((t) => t.userId === me.id);
  const mySeason = mySeasonRank >= 0 ? seasonTop[mySeasonRank] : null;
  const seasonShown = seasonTop.slice(0, 20);
  const duelsLeft = Math.max(0, DUEL_DAILY_LIMIT - todayDuels.length);
  const rewardAvailable = DUEL_DAILY_REWARD > 0 && rewardedToday === 0;

  const Ladder = ({ rows }: { rows: { id: string; name: string | null; rating: number; wins: number; losses: number; badge: string | null }[] }) => (
    <ol className="ladder">
      {rows.map((t, i) => {
        const tier = tierOf(t.rating);
        return (
          <li key={t.id} className={`${t.id === me.id ? "me" : ""} ${i < 3 ? `top top-${i + 1}` : ""}`}>
            <span className="rank">{i < 3 ? MEDALS[i] : i + 1}</span>
            <span className="opp-medal" style={{ "--tc": tier.color } as React.CSSProperties} title={tier.label}>
              {tier.kanji}
            </span>
            <Link href={`/membre/${t.id}`} className="ladder-name">
              <NameWithBadge name={t.name} badge={badgeView(t.badge)} />
            </Link>
            <span className="ladder-wl muted">
              {t.wins} V · {t.losses} D
            </span>
            <b className="ladder-rating" style={{ color: tier.color }}>
              {t.rating}
            </b>
          </li>
        );
      })}
    </ol>
  );

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
      </div>

      <header className="panel duel-hero" style={{ "--tc": myTier.color } as React.CSSProperties}>
        <div className="duel-hero-medal" aria-hidden>
          {myTier.kanji}
        </div>
        <div className="duel-hero-main">
          <p className="duel-hero-tier">{myTier.label}</p>
          <p className="duel-hero-rating">
            <b>{myRating}</b> <span className="muted">points</span>
          </p>
          <div className="tier-bar" role="img" aria-label={nextTier ? `${tierPct} % vers ${nextTier.label}` : "Palier maximum"}>
            <span style={{ width: `${tierPct}%` }} />
          </div>
          <p className="muted small-text">
            {nextTier ? `${nextTier.min - myRating} points avant ${nextTier.label}` : "Palier maximum atteint !"} · record {user?.duelPeak ?? myRating}
          </p>
        </div>
        <div className="duel-hero-stats">
          <div>
            <b>{mySeason ? `#${mySeasonRank + 1}` : "—"}</b>
            <span>{mySeason ? `saison ${deMonth(season)}` : `encore ${Math.max(0, MIN_SEASON_DUELS - myDuels)} duel${MIN_SEASON_DUELS - myDuels > 1 ? "s" : ""} pour être classé`}</span>
          </div>
          <div>
            <b>
              {user?.duelWins ?? 0}–{user?.duelLosses ?? 0}
            </b>
            <span>victoires–défaites</span>
          </div>
          <div>
            <b>{duelsLeft}</b>
            <span>duel{duelsLeft > 1 ? "s" : ""} restant{duelsLeft > 1 ? "s" : ""} aujourd&apos;hui</span>
          </div>
          <div className={rewardAvailable ? "gold" : ""}>
            <b>{rewardAvailable ? "🎁" : "✓"}</b>
            <span>{rewardAvailable ? "booster du jour à gagner" : "booster du jour gagné"}</span>
          </div>
        </div>
      </header>

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
        duelsLeft={duelsLeft}
        sameOpponentLimit={DUEL_SAME_OPPONENT_LIMIT}
        rewardAvailable={rewardAvailable}
        highlight={adversaire ?? null}
        away={away}
        myRating={myRating}
      />

      <div className="ladders">
        <div className="panel">
          <div className="page-head">
            <h2>🏅 Saison {deMonth(season)}</h2>
            <span className="muted small-text">fin dans {daysLeft} jour{daysLeft > 1 ? "s" : ""}</span>
          </div>
          <p className="muted small-text">
            Classement à la cote, au moins {MIN_SEASON_DUELS} duels dans le mois. Le podium gagne un titre et {SEASON_REWARDS.join(", ")} boosters.
          </p>
          {seasonShown.length === 0 ? (
            <p className="muted">Personne n&apos;est encore classé ce mois-ci. À toi de jouer !</p>
          ) : (
            <Ladder rows={seasonShown.map((t) => ({ id: t.userId, name: t.name, rating: t.rating, wins: t.wins, losses: t.losses, badge: t.featuredBadge }))} />
          )}
          {mySeason && mySeasonRank >= 20 && (
            <p className="small-text">
              Toi : <b>#{mySeasonRank + 1}</b> avec {mySeason.rating} points
            </p>
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
        </div>
        <div className="panel">
          <div className="page-head">
            <h2>📈 Classement général</h2>
            <span className="muted small-text">par cote</span>
          </div>
          {top.length === 0 ? (
            <p className="muted">Personne n&apos;a encore disputé de duel.</p>
          ) : (
            <Ladder rows={top.map((t) => ({ id: t.id, name: t.name, rating: t.duelRating, wins: t.duelWins, losses: t.duelLosses, badge: t.featuredBadge }))} />
          )}
        </div>
      </div>

      <div className="ladders">
        <details className="panel">
          <summary>
            <h2>📜 Mes derniers combats</h2>
          </summary>
          {history.length === 0 ? (
            <p className="muted">Aucun combat pour le moment.</p>
          ) : (
            <ul className="duel-history">
              {history.map((d) => {
                const o = outcome(d);
                const delta = d.attackerId === me.id ? d.attackerDelta : d.defenderDelta;
                const vs = d.tournament
                  ? `🏆 ${d.tournament.name} : ${d.attackerId === me.id ? `contre ${d.defender?.name}` : `contre ${d.attacker.name}`}`
                  : d.defenderId === null
                    ? "Entraînement"
                    : d.attackerId === me.id
                      ? `contre ${d.defender?.name}`
                      : `${d.attacker.name} t'a défié`;
                return (
                  <li key={d.id}>
                    <span className={`result ${o.cls}`}>{o.label}</span>
                    <span className="duel-vs">
                      {vs}
                      {d.rewarded && d.attackerId === me.id ? " 🎁" : ""}
                      {delta !== null && delta !== undefined && (
                        <small className={delta >= 0 ? "plus" : "minus"}>
                          {" "}
                          {delta >= 0 ? "+" : ""}
                          {delta}
                        </small>
                      )}
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
        </details>
        <details className="panel">
          <summary>
            <h2>🌀 Éléments et règles</h2>
          </summary>
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
            Avantage : ×1,3 de dégâts. Désavantage : ×0,8. L&apos;ATK augmente les dégâts, la DEF les réduit et ajoute des points de vie.
            Coups critiques et esquives pimentent le tout.
          </p>
          <p className="muted small-text">
            <b>La cote</b> : battre plus fort que soi rapporte beaucoup, battre bien plus faible presque rien, et perdre contre lui coûte cher.
            Le défenseur gagne ou perd deux fois moins. Paliers : Bronze, Argent (1100), Or (1250), Platine (1400), Diamant (1550), Maître
            (1700). Chaque mois, les cotes se rapprochent de 1000. Ta première victoire du jour contre un adversaire de ton niveau rapporte un
            booster.
          </p>
        </details>
      </div>
    </section>
  );
}
