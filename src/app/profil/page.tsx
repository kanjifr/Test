import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { setConsent } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Profile() {
  const me = await requireUser();
  const user = await prisma.user.findUnique({
    where: { id: me.id },
    include: { _count: { select: { cards: true, featuredIn: true } } },
  });
  if (!user) return null;

  return (
    <section className="panel narrow">
      <h1>Mon profil</h1>
      <div className="profile-row">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="avatar-lg" src={user.image} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="avatar-fallback avatar-lg">{user.name?.[0] ?? "?"}</span>
        )}
        <div>
          <h2>{user.name}</h2>
          <p className="muted">
            {user.packsOpened} boosters ouverts · {user._count.cards} cartes différentes
          </p>
        </div>
      </div>

      <form action={setConsent} className="consent">
        <h3>Apparaître sur une carte</h3>
        <p className="muted">
          Si tu acceptes, les admins peuvent créer une carte à ton effigie, avec ton avatar Discord ou une image
          de toi. Tu peux retirer ton accord à tout moment : ton image ne sera alors plus affichée sur les cartes.
        </p>
        <label className="switch">
          <input type="checkbox" name="consent" defaultChecked={user.consent} />
          <span>J&apos;accepte d&apos;apparaître sur une carte</span>
        </label>
        <button type="submit" className="btn">
          Enregistrer
        </button>
        {user._count.featuredIn > 0 && (
          <p className="muted">Tu apparais déjà sur {user._count.featuredIn} carte(s).</p>
        )}
      </form>
    </section>
  );
}
