import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { setBirthday, setConsent, setFeaturedBadge, setShowcase } from "@/app/actions";
import Link from "next/link";
import { CopyLink } from "@/components/CopyLink";
import { MONTHS } from "@/lib/birthday";
import { RARITIES } from "@/lib/game";
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
  const myCards = await prisma.userCard.findMany({
    where: { userId: me.id, card: { active: true } },
    include: { card: { select: { id: true, number: true, name: true, rarity: true } } },
    orderBy: { card: { number: "asc" } },
  });
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

      <form action={setShowcase} className="consent showcase-form" id="vitrine" key={user.showcase.join(",")}>
        <h3>✨ Ma vitrine</h3>
        <p className="muted">Les 3 cartes mises en avant sur ton profil public.</p>
        <div className="row">
          {[0, 1, 2].map((i) => (
            <label key={i}>
              Carte {i + 1}
              <select name="card" defaultValue={user.showcase[i] ?? ""}>
                <option value="">—</option>
                {myCards.map((c) => (
                  <option key={c.card.id} value={c.card.id}>
                    #{String(c.card.number).padStart(3, "0")} {c.card.name} ({RARITIES[c.card.rarity].label})
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="row">
          <button type="submit" className="btn">Enregistrer</button>
          <Link className="btn btn-ghost" href={`/membre/${user.id}`}>Voir mon profil public</Link>
          <CopyLink path={`/membre/${user.id}`} />
        </div>
      </form>

      <form action={setBirthday} className="consent birthday-form" key={`${user.birthMonth}-${user.birthDay}`}>
        <h3>🎂 Mon anniversaire</h3>
        <p className="muted">
          Le jour de ton anniversaire, ta carte brille et sort 5 fois plus souvent dans les boosters, et Kizuna te le souhaite
          sur Discord. Seuls le jour et le mois sont demandés, jamais l&apos;année.
        </p>
        <div className="row">
          <label>
            Jour
            <select name="day" defaultValue={user.birthDay ?? ""}>
              <option value="">—</option>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mois
            <select name="month" defaultValue={user.birthMonth ?? ""}>
              <option value="">—</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn">
            Enregistrer
          </button>
          {user.birthMonth && (
            <button type="submit" name="clear" value="1" className="btn btn-ghost">
              Retirer
            </button>
          )}
        </div>
        {!user.consent && (
          <p className="muted small-text">
            Pour que ta carte brille, il faut aussi accepter d&apos;apparaître sur une carte (juste au-dessus).
          </p>
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
