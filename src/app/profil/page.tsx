import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { setConsent, setFeaturedBadge } from "@/app/actions";
import { ACHIEVEMENTS, TIERS, badgeView } from "@/lib/achievements";
import { checkAchievements } from "@/lib/achievements-server";
import { Badge, NameWithBadge } from "@/components/Badge";

export const dynamic = "force-dynamic";

export default async function Profile() {
  const me = await requireUser();
  // Débloque aussi les succès déjà mérités avant leur ajout au site
  const stats = await checkAchievements(me.id);
  const unlocked = new Map(
    (await prisma.userAchievement.findMany({ where: { userId: me.id } })).map((u) => [u.achievementId, u.unlockedAt]),
  );
  const user = await prisma.user.findUnique({
    where: { id: me.id },
    include: { _count: { select: { cards: true, featuredIn: true } } },
  });
  if (!user) return null;

  return (
    <section className="panel profile">
      <h1>Mon profil</h1>
      <div className="profile-row">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="avatar-lg" src={user.image} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="avatar-fallback avatar-lg">{user.name?.[0] ?? "?"}</span>
        )}
        <div>
          <h2>
            <NameWithBadge name={user.name} badge={badgeView(user.featuredBadge)} />
          </h2>
          <p className="muted">
            {user.packsOpened} boosters ouverts · {user._count.cards} cartes différentes · {unlocked.size}/
            {ACHIEVEMENTS.length} succès
          </p>
        </div>
      </div>

      <form action={setConsent} className="consent" key={String(user.consent)}>
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

      <div id="succes" className="achievements">
        <h3>
          Succès <span className="muted">({unlocked.size}/{ACHIEVEMENTS.length})</span>
        </h3>
        <form action={setFeaturedBadge} className="row featured-form" key={user.featuredBadge ?? "none"}>
          <label>
            Badge affiché à côté de ton pseudo
            <select name="badge" defaultValue={user.featuredBadge ?? ""}>
              <option value="">— Aucun —</option>
              {ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.kanji} {a.name} ({TIERS[a.tier].label})
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-ghost">
            Afficher
          </button>
        </form>
        <ul className="ach-grid">
          {ACHIEVEMENTS.map((a) => {
            const at = unlocked.get(a.id);
            const [cur, target] = a.progress(stats);
            const p = Math.min(100, Math.round((Math.min(cur, target) / target) * 100));
            return (
              <li key={a.id} className={`ach ${at ? "done" : ""}`}>
                <Badge badge={a} locked={!at} />
                <div className="ach-body">
                  <b>{a.name}</b>
                  <span className="muted">{a.description}</span>
                  {at ? (
                    <span className="ach-date">Débloqué le {at.toLocaleDateString("fr-FR")}</span>
                  ) : (
                    <span className="ach-progress">
                      <span style={{ width: `${p}%` }} />
                      <em>
                        {Math.min(cur, target)}/{target}
                        {a.id === "half" || a.id === "full" ? " %" : ""}
                      </em>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
