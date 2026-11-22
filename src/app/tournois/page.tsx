import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can, staffRole } from "@/lib/admin";
import { MAX_PLAYERS, MIN_PLAYERS, runDueTournaments } from "@/lib/tournaments";
import { DUEL_TEAM_SIZE } from "@/lib/duel-server";
import { ConfirmButton } from "@/components/ConfirmButton";
import { cancelTournament, createTournament, joinTournament, leaveTournament, startTournamentNow } from "./actions";

export const dynamic = "force-dynamic";

const when = (d: Date) =>
  d.toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export default async function TournamentsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireUser();
  const { ok, err } = await searchParams;
  // Les tournois dont l'heure est passée se jouent dès qu'on ouvre la page
  await runDueTournaments();
  const db = await prisma.user.findUnique({ where: { id: me.id }, select: { role: true } });
  const staff = can(staffRole(me.discordId, db?.role), "manageTournaments");
  const [open, past, myCards] = await Promise.all([
    prisma.tournament.findMany({
      where: { status: "REGISTRATION" },
      orderBy: { startsAt: "asc" },
      include: { entries: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } } },
    }),
    prisma.tournament.findMany({
      where: { status: { in: ["FINISHED", "CANCELLED"] } },
      orderBy: { startsAt: "desc" },
      take: 20,
      include: { _count: { select: { entries: true } } },
    }),
    prisma.userCard.count({ where: { userId: me.id, card: { active: true } } }),
  ]);
  const winners = await prisma.user.findMany({
    where: { id: { in: past.map((t) => t.winnerId).filter((x): x is string => !!x) } },
    select: { id: true, name: true },
  });
  const winnerName = new Map(winners.map((w) => [w.id, w.name]));
  // Valeur par défaut du formulaire : samedi prochain 20 h
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  const defaultStart = `${d.toISOString().slice(0, 10)}T20:00`;

  return (
    <section className="tournaments">
      <div className="page-head">
        <h1>🏆 Tournois</h1>
        <Link href="/duels" className="btn btn-ghost btn-sm">
          🛡 Régler mon équipe de défense
        </Link>
      </div>
      <p className="muted">
        Inscris-toi, puis laisse faire ton équipe de défense : à l&apos;heure prévue, le tableau est tiré au sort et tous les
        combats se jouent automatiquement, à élimination directe. Tu pourras revoir chaque match.
      </p>
      {ok && <p className="success">{ok}</p>}
      {err && <p className="error">{err}</p>}

      {open.length === 0 ? (
        <div className="panel">
          <p className="muted">Aucun tournoi en préparation pour le moment.</p>
        </div>
      ) : (
        open.map((t) => {
          const joined = t.entries.some((e) => e.userId === me.id);
          return (
            <div key={t.id} className="panel tournament-card">
              <div className="tournament-head">
                <div>
                  <h2>{t.name}</h2>
                  <p className="muted">
                    Début {when(t.startsAt)} · 🥇 {t.reward} booster{t.reward > 1 ? "s" : ""} bonus
                    {Math.floor(t.reward / 2) > 0 && ` · 🥈 ${Math.floor(t.reward / 2)}`} · titre sur le profil
                  </p>
                </div>
                {joined ? (
                  <form action={leaveTournament}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="btn btn-ghost">✓ Inscrit · se désinscrire</button>
                  </form>
                ) : (
                  <form action={joinTournament}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="btn" disabled={myCards < DUEL_TEAM_SIZE || t.entries.length >= MAX_PLAYERS}>
                      ⚔ S&apos;inscrire
                    </button>
                  </form>
                )}
              </div>
              <p className="small-text">
                <b>{t.entries.length}</b> inscrit{t.entries.length > 1 ? "s" : ""}
                {t.entries.length > 0 && " : "}
                {t.entries.map((e, i) => (
                  <span key={e.userId}>
                    {i > 0 && ", "}
                    <Link href={`/membre/${e.user.id}`}>{e.user.name}</Link>
                  </span>
                ))}
                {t.entries.length < MIN_PLAYERS && <span className="muted"> · il faut au moins {MIN_PLAYERS} participants</span>}
              </p>
              {staff && (
                <div className="row">
                  <form action={startTournamentNow}>
                    <input type="hidden" name="id" value={t.id} />
                    <ConfirmButton className="btn btn-sm" message={`Lancer ${t.name} maintenant ? Les inscriptions seront fermées.`}>
                      ▶ Lancer maintenant
                    </ConfirmButton>
                  </form>
                  <form action={cancelTournament}>
                    <input type="hidden" name="id" value={t.id} />
                    <ConfirmButton className="btn btn-sm btn-danger" message={`Annuler ${t.name} ?`}>
                      Annuler le tournoi
                    </ConfirmButton>
                  </form>
                </div>
              )}
            </div>
          );
        })
      )}

      {staff && (
        <form action={createTournament} className="panel tournament-form">
          <h2>Créer un tournoi</h2>
          <div className="row">
            <label>
              Nom
              <input name="name" required maxLength={50} placeholder="Tournoi de la pleine lune" />
            </label>
            <label>
              Début (heure de Paris)
              <input type="datetime-local" name="startsAt" required defaultValue={defaultStart} />
            </label>
            <label>
              Boosters du vainqueur
              <input type="number" name="reward" min={0} max={20} defaultValue={3} />
            </label>
          </div>
          <label className="switch">
            <input type="checkbox" name="announce" defaultChecked />
            <span>Annoncer sur Discord</span>
          </label>
          <button className="btn">Créer le tournoi</button>
        </form>
      )}

      {past.length > 0 && (
        <div className="panel">
          <h2>Tournois passés</h2>
          <ul className="tournament-history">
            {past.map((t) => (
              <li key={t.id}>
                {t.status === "FINISHED" ? <Link href={`/tournois/${t.id}`}>{t.name}</Link> : <span>{t.name}</span>}
                <span className="muted small-text">
                  {t.startsAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} · {t._count.entries} participant{t._count.entries > 1 ? "s" : ""}
                </span>
                <span>{t.status === "CANCELLED" ? <span className="muted">Annulé</span> : <>🥇 {winnerName.get(t.winnerId ?? "") ?? "?"}</>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
