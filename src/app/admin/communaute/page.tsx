import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/admin";
import { RARITIES, RARITY_ORDER } from "@/lib/game";
import { ConfirmButton } from "@/components/ConfirmButton";
import { approveAnecdote, deleteAnecdote } from "@/app/carte/actions";
import { isOpen, pollInclude, results } from "@/lib/polls";
import { closePoll, createPoll, deletePoll } from "../poll-actions";

export const dynamic = "force-dynamic";

export default async function CommunityAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireStaff("viewPanel");
  const { ok, err } = await searchParams;
  const allow = { anecdotes: can(me.role, "moderateAnecdotes"), polls: can(me.role, "managePolls") };
  const [pendingAnecdotes, polls, consenting] = await Promise.all([
    allow.anecdotes
      ? prisma.anecdote.findMany({
          where: { status: "PENDING" },
          orderBy: { createdAt: "asc" },
          take: 50,
          include: { card: { select: { id: true, name: true, number: true } }, author: { select: { name: true } } },
        })
      : [],
    allow.polls ? prisma.poll.findMany({ include: pollInclude, orderBy: { createdAt: "desc" }, take: 12 }) : [],
    prisma.user.findMany({ where: { consent: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <section className="admin">
      <h1>💬 Livre d&apos;or et votes</h1>
      {err && <p className="error">{err}</p>}
      {ok && <p className="success">{ok}</p>}
      {allow.anecdotes && (
        <div className="panel admin-anecdotes" id="livre-d-or">
          <h2>
            📖 Livre d&apos;or <span className="muted">({pendingAnecdotes.length} en attente)</span>
          </h2>
          {pendingAnecdotes.length === 0 ? (
            <p className="muted">Aucune anecdote à valider. Les anecdotes publiées se modifient directement sur la fiche de chaque carte.</p>
          ) : (
            <ul className="admin-anecdote-list">
              {pendingAnecdotes.map((a) => (
                <li key={a.id}>
                  <p className="small-text">
                    <b>{a.author?.name ?? "Ancien membre"}</b> sur{" "}
                    <a href={`/carte/${a.card.id}#livre-d-or`}>
                      #{String(a.card.number).padStart(3, "0")} {a.card.name}
                    </a>{" "}
                    <span className="muted">· {a.createdAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</span>
                  </p>
                  <form action={approveAnecdote} className="anecdote-edit">
                    <input type="hidden" name="id" value={a.id} />
                    <textarea name="text" defaultValue={a.text} maxLength={500} rows={2} aria-label="Texte de l'anecdote (modifiable avant validation)" />
                    <button className="btn btn-sm">✔ Valider</button>
                  </form>
                  <form action={deleteAnecdote}>
                    <input type="hidden" name="id" value={a.id} />
                    <ConfirmButton className="btn btn-sm btn-danger" message="Refuser et supprimer cette anecdote ?">
                      Refuser
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {allow.polls && (
        <div className="panel admin-polls" id="votes">
          <h2>🗳️ Votes de la communauté</h2>
          <form action={createPoll} className="poll-form">
            <label>
              Question
              <input name="question" required maxLength={140} placeholder="Qui aura la prochaine carte Mythique ?" />
            </label>
            <div className="row">
              <label>
                Choix proposés
                <select name="kind" defaultValue="MEMBERS">
                  <option value="MEMBERS">Des membres</option>
                  <option value="TEXT">Des textes (titres, phrases…)</option>
                </select>
              </label>
              <label>
                Rareté en jeu (facultatif)
                <select name="rarity" defaultValue="">
                  <option value="">—</option>
                  {RARITY_ORDER.map((r) => (
                    <option key={r} value={r}>
                      {RARITIES[r].label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Durée (jours)
                <input name="days" type="number" min={1} max={14} defaultValue={3} />
              </label>
            </div>
            <fieldset className="poll-members">
              <legend>Membres proposés (si « Des membres ») · seuls ceux qui ont accepté d&apos;apparaître sur une carte</legend>
              {consenting.length === 0 ? (
                <p className="muted small-text">Aucun membre n&apos;a encore accepté d&apos;apparaître sur une carte.</p>
              ) : (
                consenting.map((m) => (
                  <label key={m.id} className="switch">
                    <input type="checkbox" name="members" value={m.id} defaultChecked />
                    <span>{m.name}</span>
                  </label>
                ))
              )}
            </fieldset>
            <label>
              Textes proposés (si « Des textes ») · un par ligne
              <textarea name="texts" rows={4} placeholder={"Le gardien du vocal\nLa reine des memes\nCelui qui ne dort jamais"} />
            </label>
            <div className="row">
              <button type="submit" className="btn">Lancer le vote</button>
            </div>
          </form>

          {polls.length > 0 && (
            <ul className="admin-poll-list">
              {polls.map((p) => {
                const r = results(p);
                const open = isOpen(p);
                const winner = r.winners.length === 1 ? r.winners[0] : null;
                return (
                  <li key={p.id}>
                    <div>
                      <b>{p.question}</b>
                      <span className="muted small-text">
                        {" "}
                        · {open ? "en cours" : "terminé"} · {r.total} vote(s)
                        {!open && (winner ? ` · gagnant : ${winner.label}` : r.winners.length > 1 ? " · égalité" : "")}
                      </span>
                    </div>
                    <div className="row">
                      {!open && winner && p.kind === "MEMBERS" && (
                        <a
                          className="btn btn-sm"
                          href={`/admin/cartes?nom=${encodeURIComponent(winner.label)}&membre=${winner.subjectId ?? ""}&rarete=${p.rarity ?? ""}`}
                        >
                          Créer la carte
                        </a>
                      )}
                      {open && (
                        <form action={closePoll}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="btn btn-sm btn-ghost">Terminer maintenant</button>
                        </form>
                      )}
                      <form action={deletePoll}>
                        <input type="hidden" name="id" value={p.id} />
                        <ConfirmButton className="btn btn-sm btn-danger" message={`Supprimer le vote « ${p.question} » ?`}>
                          Supprimer
                        </ConfirmButton>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
