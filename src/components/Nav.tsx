import Link from "next/link";
import { auth, signOut } from "@/auth";
import { PACK_COOLDOWN_MS, SITE_NAME } from "@/lib/game";
import { pendingIncomingCount } from "@/lib/trades";
import { NavLink } from "@/components/NavLink";
import { prisma } from "@/lib/prisma";
import { BoosterStatus } from "@/components/BoosterStatus";
import { MoreMenu, type MoreSection } from "@/components/MoreMenu";
import { TabBar } from "@/components/TabBar";

export async function Nav() {
  const session = await auth();
  const user = session?.user;

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  const brand = (
    <Link href="/" className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-logo" src="/logo/kizuna-embleme.svg" alt="" width={40} height={40} />
      <span className="brand-name">{SITE_NAME}</span>
    </Link>
  );
  if (!user?.id) return <header className="nav">{brand}</header>;

  const now = new Date();
  const [incoming, toModerate, toVote, toJoin, me, expBack] = await Promise.all([
    pendingIncomingCount(user.id),
    // Anecdotes à valider (staff)
    user.staffRole ? prisma.anecdote.count({ where: { status: "PENDING" } }) : 0,
    // Votes en cours auxquels le membre n'a pas encore répondu
    prisma.poll.count({ where: { closesAt: { gt: now }, votes: { none: { userId: user.id } } } }),
    // Tournois ouverts auxquels le membre n'est pas encore inscrit
    prisma.tournament.count({ where: { status: "REGISTRATION", startsAt: { gt: now }, entries: { none: { userId: user.id } } } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { coins: true, lastPackAt: true, bonusPacks: true } }),
    // Expédition revenue, butin à récupérer
    prisma.expedition.count({ where: { userId: user.id, claimedAt: null, endsAt: { lte: now } } }),
  ]);
  const nextAt = me?.lastPackAt ? me.lastPackAt.getTime() + PACK_COOLDOWN_MS : 0;
  const coins = me?.coins ?? 0;

  const sections: MoreSection[] = [
    {
      title: "Jeu",
      items: [
        { href: "/expeditions", label: "Expéditions", icon: "旅", badge: expBack || undefined, highlight: true },
        { href: "/boutique", label: "Boutique", icon: "店", highlight: true },
        { href: "/tournois", label: "Tournois", icon: "陣", badge: toJoin || undefined, highlight: true },
        { href: "/votes", label: "Votes", icon: "票", badge: toVote || undefined },
        { href: "/classement", label: "Classement", icon: "順" },
        { href: "/recyclage", label: "Recyclage", icon: "環" },
        { href: "/duels", label: "Duels", icon: "闘" },
      ],
    },
    {
      title: "Moi",
      items: [
        { href: `/membre/${user.id}`, label: "Mon profil public", icon: "顔" },
        { href: "/profil", label: "Profil et succès", icon: "設" },
        { href: "/collection", label: "Ma collection", icon: "集" },
        { href: "/profil#appli", label: "Application et notifications", icon: "鈴" },
      ],
    },
    ...(user.staffRole ? [{ title: "Staff", items: [{ href: "/admin", label: "Panel admin", icon: "管", badge: toModerate || undefined }] }] : []),
  ];
  const moreTotal = toVote + toJoin + expBack + (user.staffRole ? toModerate : 0);

  return (
    <>
      <header className="nav">
        {brand}
        <nav className="nav-links desk-only" aria-label="Menu">
          <NavLink href="/">Booster</NavLink>
          <NavLink href="/collection">Collection</NavLink>
          <NavLink href="/echanges" className="nav-trades">
            Échanges
            {incoming > 0 && <span className="nav-badge">{incoming}</span>}
          </NavLink>
          <NavLink href="/duels" className="nav-trades">
            Duels
            {toJoin > 0 && <span className="nav-badge" title="Tournoi ouvert aux inscriptions">🏆</span>}
          </NavLink>
        </nav>
        <div className="nav-status">
          <BoosterStatus nextAt={nextAt} bonus={me?.bonusPacks ?? 0} cooldownMs={PACK_COOLDOWN_MS} serverNow={now.getTime()} />
          <Link href="/boutique" className="coin-chip" title="Mes pièces · Boutique">
            🪙 <b>{coins.toLocaleString("fr-FR")}</b>
          </Link>
          <MoreMenu sections={sections} logout={logout} total={moreTotal} />
          <Link href="/profil" className="nav-avatar" title="Mon profil">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar-fallback">{user.name?.[0] ?? "?"}</span>
            )}
          </Link>
        </div>
      </header>
      <TabBar trades={incoming} duels={toJoin > 0} more={moreTotal} nextAt={nextAt} bonus={me?.bonusPacks ?? 0} cooldownMs={PACK_COOLDOWN_MS} serverNow={now.getTime()} />
    </>
  );
}
