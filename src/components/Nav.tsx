import Link from "next/link";
import { auth, signOut } from "@/auth";
import { SITE_NAME } from "@/lib/game";
import { pendingIncomingCount } from "@/lib/trades";

export async function Nav() {
  const session = await auth();
  const user = session?.user;
  const incoming = user?.id ? await pendingIncomingCount(user.id) : 0;
  return (
    <header className="nav">
      <Link href="/" className="brand">
        <span className="brand-kanji">絆</span>
        <span>{SITE_NAME}</span>
      </Link>
      {user && (
        <nav className="nav-links">
          <Link href="/">Booster</Link>
          <Link href="/collection">Collection</Link>
          <Link href="/echanges" className="nav-trades">
            Échanges
            {incoming > 0 && <span className="nav-badge">{incoming}</span>}
          </Link>
          <Link href="/classement">Classement</Link>
          <Link href="/profil">Profil</Link>
          {user.staffRole && <Link href="/admin">Admin</Link>}
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
