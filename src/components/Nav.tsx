import Link from "next/link";
import { auth, signOut } from "@/auth";
import { SITE_NAME } from "@/lib/game";
import { pendingIncomingCount } from "@/lib/trades";
import { NavLink } from "@/components/NavLink";

export async function Nav() {
  const session = await auth();
  const user = session?.user;
  const incoming = user?.id ? await pendingIncomingCount(user.id) : 0;
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
          <NavLink href="/duels">Duels</NavLink>
          <NavLink href="/classement">Classement</NavLink>
          <NavLink href="/profil">Profil</NavLink>
          {user.staffRole && <NavLink href="/admin">Admin</NavLink>}
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
