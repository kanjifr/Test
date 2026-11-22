import Link from "next/link";
import { auth, signIn, DEV_LOGIN_ENABLED } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PackOpener } from "@/components/PackOpener";
import { CardBack, GameCard } from "@/components/GameCard";
import {
  MYTHIC_BASE_CHANCE,
  PACK_COOLDOWN_MS,
  PACK_SIZE,
  PITY_HARD,
  PITY_SOFT,
  RARITIES,
  SITE_NAME,
  SLOT_RARITIES,
  SHINY_CHANCE,
} from "@/lib/game";
import { toCardView } from "@/lib/cards";
import { checkAchievements } from "@/lib/achievements-server";
import { BIRTHDAY_BOOST, parisToday } from "@/lib/birthday";
import { boosterWhere, EVENT_BOOST, frDate } from "@/lib/series";
import { QUEST_REWARD, questStatus, weekEnd } from "@/lib/quests";
import { QuestBoard } from "@/components/QuestBoard";
import { InstallHint } from "@/components/InstallHint";
import { AdventCalendar, type AdventTile } from "@/components/AdventCalendar";
import { adventToday, adventVisible, getAdventConfig, GRID_ORDER } from "@/lib/advent";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  AccessDenied: "Accès refusé : tu dois être membre du serveur Discord de la communauté.",
  CredentialsSignin: "Pseudo de test invalide.",
  Configuration: "Erreur de configuration du site (variables AUTH_… ou application Discord).",
  OAuthCallbackError: "Discord a refusé la connexion (vérifie l'ID et le secret de l'application).",
  OAuthAccountNotLinked: "Ce compte est déjà lié à un autre profil.",
  Verification: "Le lien de connexion a expiré, réessaie.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  const { error } = await searchParams;

  if (!session?.user) {
    return (
      <section className="hero">
        <span className="moon" aria-hidden />
        <div className="hero-fan" aria-hidden>
          <CardBack />
          <CardBack />
          <CardBack />
        </div>
        <h1>
          Les cartes de la <span className="accent">communauté</span>
        </h1>
        <p className="lead">
          Ouvre un booster toutes les {PACK_COOLDOWN_MS / 3600_000} h, découvre les membres sous forme de
          cartes et complète ta collection. Qui obtiendra la première Légendaire ?
        </p>
        {error && (
          <p className="error">
            {ERRORS[error] ?? "La connexion a échoué, réessaie."} <small>(code : {error.slice(0, 40)})</small>
          </p>
        )}
        <form
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo: "/" });
          }}
        >
          <button type="submit" className="btn btn-discord">
            <DiscordIcon /> Se connecter avec Discord
          </button>
        </form>
        {DEV_LOGIN_ENABLED && (
          <form
            className="dev-login"
            action={async (fd: FormData) => {
              "use server";
              await signIn("dev", { name: fd.get("name"), redirectTo: "/" });
            }}
          >
            <input name="name" placeholder="Pseudo de test" required pattern="[A-Za-z0-9_\-]{2,32}" />
            <button type="submit" className="btn btn-ghost">
              Connexion de test
            </button>
          </form>
        )}
      </section>
    );
  }

  await checkAchievements(session.user.id);
  const today = parisToday();
  const now = new Date();
  const [user, mythics, recent, birthdays, liveEvents, newSeries, quests, tournament] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { lastPackAt: true, pityCount: true, bonusPacks: true } }),
    prisma.card.count({ where: { ...boosterWhere(now), rarity: "MYTHIQUE" } }),
    prisma.pull.findMany({
      where: { card: { rarity: { in: ["EPIQUE", "LEGENDAIRE", "MYTHIQUE"] } } },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        user: { select: { name: true } },
        card: { include: { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } } },
      },
    }),
    prisma.user.findMany({
      where: { consent: true, birthMonth: today.month, birthDay: today.day, featuredIn: { some: { active: true } } },
      select: {
        id: true,
        name: true,
        featuredIn: { where: { active: true }, include: { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } } },
      },
    }),
    // Cartes d'événement qu'on peut obtenir en ce moment
    prisma.card.findMany({
      where: { ...boosterWhere(now), eventName: { not: null }, NOT: { availableFrom: null, availableUntil: null } },
      orderBy: { number: "asc" },
      include: { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } },
    }),
    // Séries arrivées dans les boosters ces 14 derniers jours
    prisma.adminLog.findMany({
      where: { action: "series.update", details: { contains: "ajoutée aux boosters" }, createdAt: { gte: new Date(now.getTime() - 14 * 86400_000) } },
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
    questStatus(session.user.id),
    // Prochain tournoi ouvert auquel le membre n'est pas inscrit
    prisma.tournament.findFirst({
      where: { status: "REGISTRATION", startsAt: { gt: now }, entries: { none: { userId: session.user.id } } },
      orderBy: { startsAt: "asc" },
      select: { name: true, startsAt: true, reward: true },
    }),
  ]);
  const events = new Map<string, { until: Date | null; cards: typeof liveEvents }>();
  for (const c of liveEvents) {
    const e = events.get(c.eventName!) ?? { until: c.availableUntil, cards: [] };
    e.cards.push(c);
    if (c.availableUntil && (!e.until || c.availableUntil < e.until)) e.until = c.availableUntil;
    events.set(c.eventName!, e);
  }
  const latestSeries = newSeries.length
    ? await prisma.series.findFirst({ where: { inBoosters: true }, orderBy: { createdAt: "desc" }, include: { _count: { select: { cards: { where: { active: true } } } } } })
    : null;
  // Calendrier de l'Avent (du 1er au 26 décembre)
  const at = adventToday();
  let advent: { tiles: AdventTile[]; grandMin: number; opened: number } | null = null;
  if (adventVisible(at)) {
    const [claims, cfg] = await Promise.all([
      prisma.adventClaim.findMany({ where: { userId: session.user.id, year: at.year } }),
      getAdventConfig(),
    ]);
    const byDay = new Map(claims.map((c) => [c.day, c]));
    const current = at.day ?? 25;
    advent = {
      grandMin: cfg.grandMin,
      opened: claims.length,
      tiles: GRID_ORDER.map((day) => {
        const c = byDay.get(day);
        if (c) return { day, state: "opened", label: c.label };
        if (day === at.day) return { day, state: "today" };
        return { day, state: day < current ? "missed" : "locked" };
      }),
    };
  }
  const nextAt = user?.lastPackAt ? user.lastPackAt.getTime() + PACK_COOLDOWN_MS : 0;

  const fmt = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
  const totalWeight = SLOT_RARITIES.reduce((sum, r) => sum + RARITIES[r].weight, 0);
  const rates = [
    ...SLOT_RARITIES.map((r) => ({
      label: RARITIES[r].label,
      color: RARITIES[r].color,
      pct: `${fmt((RARITIES[r].weight / totalWeight) * 100)} par carte`,
    })),
    ...(mythics > 0
      ? [{ label: RARITIES.MYTHIQUE.label, color: RARITIES.MYTHIQUE.color, pct: `${fmt(MYTHIC_BASE_CHANCE * 100)} par booster` }]
      : []),
    ...(SHINY_CHANCE > 0 ? [{ label: "✦ Brillante", color: "#ffffff", pct: `${fmt(SHINY_CHANCE * 100)} par carte` }] : []),
  ];

  return (
    <>
      <PackOpener
        initialNextAt={nextAt}
        serverNow={Date.now()}
        siteName={SITE_NAME}
        packSize={PACK_SIZE}
        initialPity={Math.min(user?.pityCount ?? 0, PITY_HARD - 1)}
        initialBonus={user?.bonusPacks ?? 0}
        pityHard={PITY_HARD}
        pitySoft={PITY_SOFT}
        mythicAvailable={mythics > 0}
        rates={rates}
      >
        <InstallHint />
        {(birthdays.length > 0 || latestSeries || tournament || events.size > 0) && (
          <section className="news" aria-label="À la une">
            <h2 className="news-title">À la une</h2>
            <div className="news-strip">
              {birthdays.length > 0 && (
                <div className="news-card news-birthday">
                  <span className="news-icon" aria-hidden>
                    🎂
                  </span>
                  <div className="news-body">
                    <b>Joyeux anniversaire {birthdays.map((b) => b.name).join(" et ")} !</b>
                    <span>
                      {birthdays.length > 1 ? "Leurs cartes sortent" : "Sa carte sort"} {BIRTHDAY_BOOST}× plus souvent jusqu&apos;à minuit.
                    </span>
                  </div>
                  <div className="news-cards">
                    {birthdays.flatMap((b) => b.featuredIn).slice(0, 2).map((c) => (
                      <GameCard key={c.id} card={toCardView(c)} size="xs" />
                    ))}
                  </div>
                </div>
              )}
              {[...events].map(([name, e]) => (
                <div key={name} className="news-card news-event">
                  <span className="news-icon" aria-hidden>
                    ✿
                  </span>
                  <div className="news-body">
                    <b>Événement : {name}</b>
                    <span>
                      {e.cards.length} carte{e.cards.length > 1 ? "s" : ""} limitée{e.cards.length > 1 ? "s" : ""}
                      {e.until ? ` jusqu'au ${frDate(e.until)}` : ""}, {EVENT_BOOST}× plus fréquentes. Ensuite : échange seulement !
                    </span>
                  </div>
                  <div className="news-cards">
                    {e.cards.slice(0, 2).map((c) => (
                      <GameCard key={c.id} card={toCardView(c)} size="xs" />
                    ))}
                  </div>
                </div>
              ))}
              {tournament && (
                <Link href="/tournois" className="news-card news-tournament">
                  <span className="news-icon" aria-hidden>
                    🏆
                  </span>
                  <div className="news-body">
                    <b>Tournoi : {tournament.name}</b>
                    <span>
                      {tournament.startsAt.toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
                      {" · "}
                      {tournament.reward} booster{tournament.reward > 1 ? "s" : ""} au vainqueur
                    </span>
                    <span className="news-cta">Inscris-toi →</span>
                  </div>
                </Link>
              )}
              {latestSeries && (
                <Link href="/collection" className="news-card news-series">
                  <span className="news-icon" aria-hidden>
                    🌸
                  </span>
                  <div className="news-body">
                    <b>Nouvelle série : {latestSeries.name}</b>
                    <span>
                      {latestSeries.description || "De nouvelles cartes dans les boosters."} {latestSeries._count.cards} carte
                      {latestSeries._count.cards > 1 ? "s" : ""} à découvrir.
                    </span>
                  </div>
                </Link>
              )}
            </div>
          </section>
        )}
        {advent && <AdventCalendar tiles={advent.tiles} grandMin={advent.grandMin} openedCount={advent.opened} today={at.day} />}
        {QUEST_REWARD > 0 && <QuestBoard quests={quests} reward={QUEST_REWARD} endsAt={weekEnd(now).getTime()} />}
        {recent.length > 0 && (
          <section className="panel feed" aria-label="Derniers grands tirages">
            <h2>Derniers grands tirages</h2>
            <div className="feed-list">
              {recent.map((p) => (
                <div key={p.id} className="feed-item">
                  <GameCard card={toCardView(p.card)} size="xs" />
                  <p>
                    <b>{p.user.name}</b> l&apos;a obtenue
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </PackOpener>
    </>
  );
}

function DiscordIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 127 96" fill="currentColor" aria-hidden>
      <path d="M107.7 8.1A105 105 0 0 0 81.5 0a72 72 0 0 0-3.4 6.9 97.7 97.7 0 0 0-29.1 0A72 72 0 0 0 45.6 0a105.9 105.9 0 0 0-26.2 8.1C2.8 32.7-1.7 56.6.5 80.2a105.7 105.7 0 0 0 32.2 16.1 77.7 77.7 0 0 0 6.9-11.2 68.4 68.4 0 0 1-10.8-5.2c.9-.7 1.8-1.4 2.7-2.1a75.6 75.6 0 0 0 64.3 0c.9.7 1.8 1.5 2.7 2.1a68.7 68.7 0 0 1-10.9 5.2 77 77 0 0 0 6.9 11.2 105.3 105.3 0 0 0 32.2-16.1c2.6-27.3-4.5-51-18.9-72.1ZM42.5 65.7c-6.3 0-11.5-5.7-11.5-12.8s5-12.8 11.5-12.8S54 45.9 53.9 52.9c0 7-5.1 12.8-11.4 12.8Zm42.4 0c-6.3 0-11.5-5.7-11.5-12.8s5-12.8 11.5-12.8 11.5 5.8 11.4 12.8c0 7-5 12.8-11.4 12.8Z" />
    </svg>
  );
}
