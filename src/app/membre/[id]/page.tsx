import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ACHIEVEMENTS, TIERS, badgeView } from "@/lib/achievements";
import { ROLE_LABELS, staffRole } from "@/lib/admin";
import { toCardView } from "@/lib/cards";
import { boosted } from "@/lib/evolution";
import { SITE_NAME } from "@/lib/game";
import { Badge, NameWithBadge } from "@/components/Badge";
import { GameCard } from "@/components/GameCard";
import { CopyLink } from "@/components/CopyLink";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const u = await prisma.user.findUnique({ where: { id }, select: { name: true } });
  return { title: u ? `${u.name} · ${SITE_NAME}` : SITE_NAME };
}

const subjectSelect = { select: { image: true, consent: true, birthMonth: true, birthDay: true } } as const;

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, image: true, discordId: true, role: true, featuredBadge: true, showcase: true, consent: true,
      packsOpened: true, duelWins: true, duelLosses: true, createdAt: true, prestige: true,
      seasonAwards: { orderBy: { createdAt: "desc" }, take: 12 },
      achievements: { select: { achievementId: true } },
      cards: { where: { card: { active: true } }, include: { card: { include: { subject: subjectSelect } } } },
      featuredIn: { where: { active: true }, include: { subject: subjectSelect }, orderBy: { number: "asc" } },
    },
  });
  if (!user) notFound();
  const [totalCards, tradesDone] = await Promise.all([
    prisma.card.count({ where: { active: true } }),
    prisma.trade.count({ where: { status: "ACCEPTED", OR: [{ fromId: id }, { toId: id }] } }),
  ]);
  const owned = new Map(user.cards.map((o) => [o.cardId, o]));
  const showcase = user.showcase.map((cid) => owned.get(cid)).filter((o): o is NonNullable<typeof o> => !!o);
  const count = (r: string) => user.cards.filter((o) => o.card.rarity === r).length;
  const pct = totalCards ? Math.round((user.cards.length / totalCards) * 100) : 0;
  const unlocked = new Set(user.achievements.map((a) => a.achievementId));
  const role = staffRole(user.discordId, user.role);
  const isMe = user.id === me.id;

  return (
    <section className="member">
      <header className="panel member-head">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="member-avatar" src={user.image} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="avatar-fallback member-avatar">{user.name?.[0] ?? "?"}</span>
        )}
        <div className="member-id">
          <h1>
            <NameWithBadge name={user.name} badge={badgeView(user.featuredBadge)} />
          </h1>
          {(user.prestige > 0 || user.seasonAwards.length > 0) && (
            <p className="titles">
              {user.prestige > 0 && (
                <span className="title-chip prestige-chip" title={`A remis sa collection complète à zéro ${user.prestige} fois`}>
                  {"✪".repeat(Math.min(user.prestige, 5))} Prestige {user.prestige}
                </span>
              )}
              {user.seasonAwards.map((a) => (
                <span key={a.id} className={`title-chip rank-${a.rank}`}>
                  {a.rank <= 3 ? ["🥇", "🥈", "🥉"][a.rank - 1] : "🏅"} {a.label}
                </span>
              ))}
            </p>
          )}
          <p className="muted">
            {role && <span className="role-chip">{ROLE_LABELS[role]}</span>} Membre depuis le{" "}
            {user.createdAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}
          </p>
        </div>
        <div className="row member-actions">
          <CopyLink path={`/membre/${user.id}`} />
          <Link className="btn btn-ghost" href={`/collection?u=${user.id}`}>Collection</Link>
          {!isMe && <Link className="btn btn-ghost" href={`/echanges/nouveau?avec=${user.id}`}>⇄ Échanger</Link>}
          {!isMe && <Link className="btn" href={`/duels?adversaire=${user.id}`}>⚔ Défier</Link>}
          {isMe && <Link className="btn" href="/profil#vitrine">Modifier ma vitrine</Link>}
        </div>
      </header>

      <div className="member-stats">
        <div className="panel stat"><b>{user.cards.length}<small>/{totalCards}</small></b><span>cartes ({pct} %)</span></div>
        <div className="panel stat"><b>{count("MYTHIQUE")}</b><span>Mythique{count("MYTHIQUE") > 1 ? "s" : ""}</span></div>
        <div className="panel stat"><b>{count("LEGENDAIRE")}</b><span>Légendaire{count("LEGENDAIRE") > 1 ? "s" : ""}</span></div>
        <div className="panel stat shiny-stat"><b>{user.cards.filter((o) => o.shiny > 0).length}</b><span>✦ brillante{user.cards.filter((o) => o.shiny > 0).length > 1 ? "s" : ""}</span></div>
        <div className="panel stat"><b>{user.packsOpened}</b><span>boosters ouverts</span></div>
        <div className="panel stat"><b>{user.duelWins}<small> V · {user.duelLosses} D</small></b><span>en duel</span></div>
        <div className="panel stat"><b>{tradesDone}</b><span>échange{tradesDone > 1 ? "s" : ""}</span></div>
      </div>

      <div className="panel">
        <h2>✨ Vitrine</h2>
        {showcase.length === 0 ? (
          <p className="muted">{isMe ? "Choisis jusqu'à 3 cartes à mettre en avant dans ton profil." : "Pas encore de cartes en vitrine."}</p>
        ) : (
          <div className="showcase">
            {showcase.map((o) => (
              <Link key={o.cardId} href={`/carte/${o.cardId}`} className="showcase-item">
                <GameCard
                  card={(() => {
                    const v = toCardView(o.card);
                    return { ...v, shiny: o.shiny > 0, level: o.level, attack: boosted(v.attack, o.level), defense: boosted(v.defense, o.level) };
                  })()}
                  size="md"
                  count={o.count}
                />
              </Link>
            ))}
          </div>
        )}
      </div>

      {user.consent && user.featuredIn.length > 0 && (
        <div className="panel">
          <h2>🎴 Ses cartes</h2>
          <p className="muted small-text">Les cartes à l&apos;effigie de {user.name}.</p>
          <div className="showcase">
            {user.featuredIn.map((c) => (
              <Link key={c.id} href={`/carte/${c.id}`} className="showcase-item">
                <GameCard card={toCardView(c)} size="sm" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h2>🏅 Succès <span className="muted">({unlocked.size}/{ACHIEVEMENTS.length})</span></h2>
        <div className="member-badges">
          {ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).map((a) => (
            <div key={a.id} className="member-badge">
              <Badge badge={a} />
              <span>
                <b>{a.name}</b>
                <small className="muted">{TIERS[a.tier].label}</small>
              </span>
            </div>
          ))}
          {unlocked.size === 0 && <p className="muted">Aucun succès pour le moment.</p>}
        </div>
      </div>
    </section>
  );
}
