import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { finalizePolls, isOpen, pollInclude, results } from "@/lib/polls";
import { RARITIES } from "@/lib/game";
import { castVote } from "./actions";

export const dynamic = "force-dynamic";

function timeLeft(d: Date) {
  const h = Math.max(0, Math.round((d.getTime() - Date.now()) / 3600_000));
  if (h >= 48) return `encore ${Math.round(h / 24)} jours`;
  if (h >= 1) return `encore ${h} h`;
  return "se termine bientôt";
}

export default async function VotesPage() {
  const me = await requireUser();
  await finalizePolls();
  const polls = await prisma.poll.findMany({ include: pollInclude, orderBy: { closesAt: "desc" }, take: 30 });
  const open = polls.filter((p) => isOpen(p)).sort((a, b) => a.closesAt.getTime() - b.closesAt.getTime());
  const closed = polls.filter((p) => !isOpen(p)).slice(0, 10);

  return (
    <section className="votes">
      <h1>🗳️ Votes</h1>
      <p className="lead left">
        La communauté décide ! Vote pour la prochaine carte, son titre ou sa phrase. Tu peux changer d&apos;avis jusqu&apos;à la
        fin du vote.
      </p>

      {open.length === 0 && <p className="panel muted">Aucun vote en cours pour le moment. Reviens bientôt !</p>}

      {open.map((p) => {
        const r = results(p);
        const mine = p.votes.find((v) => v.userId === me.id)?.optionId;
        return (
          <article key={p.id} className="panel poll">
            <header className="poll-head">
              <div>
                <h2>{p.question}</h2>
                <p className="muted small-text">
                  {timeLeft(p.closesAt)} · {r.total} vote{r.total > 1 ? "s" : ""}
                  {p.rarity && (
                    <>
                      {" "}
                      · carte <b style={{ color: RARITIES[p.rarity].color }}>{RARITIES[p.rarity].label}</b> en jeu
                    </>
                  )}
                </p>
              </div>
              {mine ? <span className="poll-done">✔ A voté</span> : <span className="poll-todo">À toi de voter !</span>}
            </header>
            <ul className="poll-options">
              {p.options.map((o) => {
                const row = r.rows.find((x) => x.option.id === o.id)!;
                const chosen = mine === o.id;
                return (
                  <li key={o.id}>
                    <form action={castVote}>
                      <input type="hidden" name="pollId" value={p.id} />
                      <input type="hidden" name="optionId" value={o.id} />
                      <button type="submit" className={`poll-option ${chosen ? "chosen" : ""}`} aria-pressed={chosen}>
                        {mine && <span className="poll-fill" style={{ width: `${row.pct}%` }} />}
                        <span className="poll-label">
                          {o.subject?.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={o.subject.image} alt="" referrerPolicy="no-referrer" />
                          ) : p.kind === "MEMBERS" ? (
                            <span className="avatar-fallback">{o.label[0]}</span>
                          ) : null}
                          {chosen && (
                            <span className="poll-check" aria-label="Ton choix">
                              ✔
                            </span>
                          )}
                          {o.label}
                        </span>
                        {mine && (
                          <span className="poll-pct">
                            {row.pct} % <small>({row.votes})</small>
                          </span>
                        )}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
            {!mine && <p className="muted small-text">Les résultats s&apos;affichent une fois que tu as voté.</p>}
          </article>
        );
      })}

      {closed.length > 0 && (
        <>
          <h2 className="votes-past">Votes terminés</h2>
          <div className="votes-closed">
            {closed.map((p) => {
              const r = results(p);
              return (
                <article key={p.id} className="panel poll closed">
                  <h3>{p.question}</h3>
                  <p className="poll-winner">
                    {r.winners.length === 0
                      ? "Personne n'a voté."
                      : r.winners.length === 1
                        ? <>🏆 <b>{r.winners[0].label}</b></>
                        : <>🤝 Égalité : <b>{r.winners.map((w) => w.label).join(" et ")}</b></>}
                  </p>
                  <p className="muted small-text">
                    {r.total} vote{r.total > 1 ? "s" : ""} · terminé le{" "}
                    {p.closesAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}
                  </p>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
