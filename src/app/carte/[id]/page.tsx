import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can, staffRole } from "@/lib/admin";
import { toCardView } from "@/lib/cards";
import { ELEMENTS, RARITIES, SITE_NAME } from "@/lib/game";
import { GameCard } from "@/components/GameCard";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ANECDOTE_MAX } from "@/lib/anecdotes";
import { deleteAnecdote, editAnecdote, submitAnecdote } from "../actions";
import { eventOver, frDate, inWindow } from "@/lib/series";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const card = await prisma.card.findUnique({ where: { id }, select: { name: true } });
  return { title: card ? `${card.name} · ${SITE_NAME}` : SITE_NAME };
}

export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const me = await requireUser();
  const [{ id }, { ok, err }] = await Promise.all([params, searchParams]);
  const db = await prisma.user.findUnique({ where: { id: me.id }, select: { role: true } });
  const staff = can(staffRole(me.discordId, db?.role), "moderateAnecdotes");

  const card = await prisma.card.findUnique({
    where: { id },
    include: {
      subject: { select: { id: true, name: true, image: true, consent: true, birthMonth: true, birthDay: true } },
      owners: { select: { userId: true, count: true, shiny: true } },
      series: { select: { name: true, inBoosters: true } },
      variantOf: { select: { id: true, name: true, number: true, active: true } },
      variants: { where: { active: true }, select: { id: true, name: true, number: true } },
      anecdotes: {
        where: { OR: [{ status: "APPROVED" }, { status: "PENDING", authorId: me.id }] },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, image: true } } },
      },
    },
  });
  if (!card || (!card.active && !staff)) notFound();
  const view = toCardView(card);
  const copies = card.owners.reduce((s, o) => s + o.count, 0);
  const mineRow = card.owners.find((o) => o.userId === me.id);
  const mine = mineRow?.count ?? 0;
  const myShiny = mineRow?.shiny ?? 0;
  const shinyAround = card.owners.reduce((s, o) => s + o.shiny, 0);

  return (
    <section className="card-page">
      <div className="card-page-top">
        <div className="card-page-visual">
          <GameCard card={{ ...view, shiny: myShiny > 0 }} size="lg" />
        </div>
        <div className="panel card-page-info">
          <p className="muted small-text">Carte #{String(card.number).padStart(3, "0")}</p>
          <h1>{card.name}</h1>
          {card.title && <p className="card-page-title">« {card.title} »</p>}
          <p>
            <span className="pill" style={{ background: RARITIES[card.rarity].color }}>{RARITIES[card.rarity].label}</span>{" "}
            <span className="pill" style={{ background: ELEMENTS[card.element].color }}>{ELEMENTS[card.element].label}</span>
          </p>
          {card.description && <p className="desc">{card.description}</p>}
          <ul className="card-facts">
            <li><b>{card.attack}</b> ATK · <b>{card.defense}</b> DEF</li>
            <li><b>{copies}</b> exemplaire{copies > 1 ? "s" : ""} en circulation, chez <b>{card.owners.length}</b> membre{card.owners.length > 1 ? "s" : ""}</li>
            <li>
              {mine ? <>Tu en as <b>{mine}</b>{myShiny > 0 && <> dont <b>{myShiny}</b> brillante{myShiny > 1 ? "s" : ""} ✦</>}</> : "Tu ne l'as pas encore"}
            </li>
            {shinyAround > 0 && <li>✦ <b>{shinyAround}</b> version{shinyAround > 1 ? "s" : ""} brillante{shinyAround > 1 ? "s" : ""} dans la communauté</li>}
            {card.series && (
              <li>
                Série <b>{card.series.name}</b>
                {!card.series.inBoosters && " · ne sort plus des boosters"}
              </li>
            )}
            {card.eventName && (
              <li>
                ✿ Carte de l&apos;événement <b>{card.eventName}</b>
                {card.availableUntil &&
                  (eventOver(card)
                    ? ` · terminé le ${frDate(card.availableUntil)}, obtenable uniquement par échange`
                    : inWindow(card)
                      ? ` · disponible jusqu'au ${frDate(card.availableUntil)}`
                      : card.availableFrom
                        ? ` · à partir du ${frDate(card.availableFrom)}`
                        : "")}
              </li>
            )}
            {card.variantOf?.active && (
              <li>
                Version alternative de <Link href={`/carte/${card.variantOf.id}`}>#{String(card.variantOf.number).padStart(3, "0")} {card.variantOf.name}</Link>
              </li>
            )}
            {card.variants.length > 0 && (
              <li>
                Version{card.variants.length > 1 ? "s" : ""} alternative{card.variants.length > 1 ? "s" : ""} :{" "}
                {card.variants.map((v, i) => (
                  <span key={v.id}>
                    {i > 0 && ", "}
                    <Link href={`/carte/${v.id}`}>#{String(v.number).padStart(3, "0")} {v.name}</Link>
                  </span>
                ))}
              </li>
            )}
            {card.subject?.consent && (
              <li>
                Carte de <Link href={`/membre/${card.subject.id}`}>{card.subject.name}</Link>
              </li>
            )}
          </ul>
          <div className="row">
            <a className="btn" href={`/api/cartes/${card.id}/image${myShiny > 0 ? "?brillante=1" : ""}`} download={`kizuna-${card.name}.png`}>
              🖼️ Télécharger l&apos;image
            </a>
            <Link className="btn btn-ghost" href="/collection">
              Ma collection
            </Link>
          </div>
          <p className="muted small-text">L&apos;image est prête à être postée sur Discord.</p>
        </div>
      </div>

      <div className="panel guestbook" id="livre-d-or">
        <h2>📖 Livre d&apos;or</h2>
        <p className="muted">
          Les anecdotes et les petits mots de la communauté sur {card.subject?.consent ? card.subject.name : "cette carte"}.
        </p>
        {ok === "attente" && <p className="success">Merci ! Ton anecdote sera visible dès qu&apos;un membre du staff l&apos;aura validée.</p>}
        {ok === "publiee" && <p className="success">Anecdote publiée ✔</p>}
        {err && <p className="error">{err}</p>}

        {card.anecdotes.length === 0 ? (
          <p className="muted">Le livre d&apos;or est encore vide. Sois le premier à écrire !</p>
        ) : (
          <ul className="anecdotes">
            {card.anecdotes.map((a) => (
              <li key={a.id} className={a.status === "PENDING" ? "pending" : ""}>
                <div className="anecdote-head">
                  {a.author?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.author.image} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="avatar-fallback">{a.author?.name?.[0] ?? "?"}</span>
                  )}
                  <b>{a.author?.name ?? "Ancien membre"}</b>
                  <time className="muted small-text">{a.createdAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</time>
                  {a.status === "PENDING" && <span className="anecdote-pending">En attente de validation</span>}
                </div>
                {staff ? (
                  <div className="anecdote-staff">
                    <form action={editAnecdote} className="anecdote-edit">
                      <input type="hidden" name="id" value={a.id} />
                      <textarea name="text" defaultValue={a.text} maxLength={ANECDOTE_MAX} rows={2} aria-label="Texte de l'anecdote" />
                      <button className="btn btn-sm btn-ghost">Enregistrer</button>
                    </form>
                    <form action={deleteAnecdote}>
                      <input type="hidden" name="id" value={a.id} />
                      <ConfirmButton className="btn btn-sm btn-danger" message="Supprimer cette anecdote ?">
                        Supprimer
                      </ConfirmButton>
                    </form>
                  </div>
                ) : (
                  <p className="anecdote-text">{a.text}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        <form action={submitAnecdote} className="anecdote-form">
          <input type="hidden" name="cardId" value={card.id} />
          <label>
            {staff ? "Ajouter une anecdote (publiée directement)" : "Partager une anecdote ou un petit mot"}
            <textarea name="text" required minLength={3} maxLength={ANECDOTE_MAX} rows={3} placeholder="La fois où…" />
          </label>
          <div className="row">
            <button className="btn">Envoyer</button>
            {!staff && <span className="muted small-text">Elle sera lue par le staff avant d&apos;apparaître.</span>}
          </div>
        </form>
      </div>
    </section>
  );
}
