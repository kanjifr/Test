import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { roundName, type Bracket } from "@/lib/tournaments";

export const dynamic = "force-dynamic";

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const t = await prisma.tournament.findUnique({ where: { id }, include: { entries: { include: { user: { select: { id: true, name: true } } } } } });
  if (!t || t.status !== "FINISHED" || !t.bracket) notFound();
  const names = new Map(t.entries.map((e) => [e.userId, e.user.name ?? "?"]));
  const bracket = t.bracket as unknown as Bracket;
  const name = (uid: string | null) => (uid ? (names.get(uid) ?? "Ancien membre") : "—");

  return (
    <section className="tournament-page">
      <div className="page-head">
        <h1>🏆 {t.name}</h1>
        <Link href="/tournois">← Tous les tournois</Link>
      </div>
      <p className="muted">
        {t.startsAt.toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" })} · {t.entries.length} participants · 🥇{" "}
        <b>{name(t.winnerId)}</b>
      </p>
      <div className="bracket" style={{ gridTemplateColumns: `repeat(${bracket.rounds.length}, minmax(190px, 1fr))` }}>
        {bracket.rounds.map((r, ri) => (
          <div key={ri} className="bracket-round">
            <h2>{roundName(r.matches.length)}</h2>
            <div className="bracket-matches">
              {r.matches.map((m, mi) => (
                <div key={mi} className={`bracket-match ${m.a === me.id || m.b === me.id ? "mine" : ""}`}>
                  {[m.a, m.b].map((p, pi) => (
                    <div key={pi} className={`bracket-player ${p && p === m.winner ? "won" : "lost"}`}>
                      <span>{p ? name(p) : <i className="muted">exempté</i>}</span>
                      {m.score && <b>{m.score[pi]}</b>}
                    </div>
                  ))}
                  {m.duelId ? (
                    <Link href={`/duels/${m.duelId}`} className="bracket-replay">
                      ▶ Revoir
                    </Link>
                  ) : (
                    <span className="bracket-replay muted">qualifié d&apos;office</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
