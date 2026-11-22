import Link from "next/link";
import { auth, signOut } from "@/auth";
import { SITE_NAME } from "@/lib/game";
import { pendingIncomingCount } from "@/lib/trades";
import { NavLink } from "@/components/NavLink";
import { SoundToggle } from "@/components/SoundToggle";
import { prisma } from "@/lib/prisma";

export async function Nav() {
  const session = await auth();
  const user = session?.user;
  const incoming = user?.id ? await pendingIncomingCount(user.id) : 0;
  // Votes en cours auxquels le membre n'a pas encore répondu
  // Anecdotes à valider (staff)
  const toModerate = user?.staffRole ? await prisma.anecdote.count({ where: { status: "PENDING" } }) : 0;
  const toVote = user?.id
    ? await prisma.poll.count({ where: { closesAt: { gt: new Date() }, votes: { none: { userId: user.id } } } })
    : 0;
  // Tournois ouverts auxquels le membre n'est pas encore inscrit
  const toJoin = user?.id
    ? await prisma.tournament.count({ where: { status: "REGISTRATION", startsAt: { gt: new Date() }, entries: { none: { userId: user.id } } } })
    : 0;
  return (
    <header className="nav">
      <Link href="/" className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/logo/kizuna-embleme.svg" alt="" width={40} height={40} />
        <span>{SITE_NAME}</span>
      </Link>
      {user && (
        <nav className="nav-links">
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
          <NavLink href="/votes" className="nav-trades">
            Votes
            {toVote > 0 && <span className="nav-badge">{toVote}</span>}
          </NavLink>
          <NavLink href="/classement">Classement</NavLink>
          <NavLink href="/profil">Profil</NavLink>
          {user.staffRole && (
            <NavLink href="/admin" className="nav-trades">
              Admin
              {toModerate > 0 && <span className="nav-badge">{toModerate}</span>}
            </NavLink>
          )}
          <SoundToggle />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit" className="nav-user" title="Se déconnecter">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="avatar-fallback">{user.name?.[0] ?? "?"}</span>
              )}
              <span className="logout">Déconnexion</span>
            </button>
          </form>
        </nav>
      )}
    </header>
  );
}
