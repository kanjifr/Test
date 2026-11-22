import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { tierOf } from "@/lib/elo";
import { duelsResetAt } from "@/lib/seasons";
import { ConfirmButton } from "@/components/ConfirmButton";
import { resetDuels } from "./actions";

export const dynamic = "force-dynamic";

export default async function DuelsAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireStaff("manageDuels");
  const { ok, err } = await searchParams;
  const [top, total, history, resetAt] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ duelRating: "desc" }, { duelWins: "desc" }], take: 15, select: { id: true, name: true, duelRating: true, duelPeak: true, duelWins: true, duelLosses: true } }),
    prisma.duel.count({ where: { defenderId: { not: null }, tournamentId: null } }),
    prisma.duel.count({ where: { tournamentId: null } }),
    duelsResetAt(),
  ]);
  return (
    <section className="admin">
      <h1>⚔ Duels</h1>
      {ok && <p className="success">{ok}</p>}
      {err && <p className="error">{err}</p>}
      <div className="panel">
        <h2>Cotes actuelles</h2>
        <p className="muted small-text">
          {total} duel{total > 1 ? "s" : ""} entre membres dans l&apos;historique ({history} avec les entraînements).
          {resetAt && ` Dernière remise à zéro : ${resetAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}.`}
        </p>
        <div className="table-scroll">
          <table className="members">
            <thead>
              <tr>
                <th>Membre</th>
                <th>Cote</th>
                <th>Record</th>
                <th>Victoires</th>
                <th>Défaites</th>
              </tr>
            </thead>
            <tbody>
              {top.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td style={{ color: tierOf(u.duelRating).color }}>
                    <b>{u.duelRating}</b> {tierOf(u.duelRating).label}
                  </td>
                  <td>{u.duelPeak}</td>
                  <td>{u.duelWins}</td>
                  <td>{u.duelLosses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form action={resetDuels} className="panel danger-zone">
        <h2>Remettre les duels à zéro</h2>
        <p className="small-text">
          Pour <b>tous les membres</b> : victoires et défaites à 0, cote et record à 1000. La saison en cours repart de maintenant (les duels
          d&apos;avant ne comptent plus). Les titres déjà gagnés (podiums, tournois) sont conservés.
        </p>
        <label className="switch">
          <input type="checkbox" name="history" />
          <span>Supprimer aussi l&apos;historique et les rediffusions des combats (hors tournois)</span>
        </label>
        <label>
          Pour confirmer, écris <b>REMETTRE A ZERO</b>
          <input name="confirm" autoComplete="off" required />
        </label>
        <ConfirmButton className="btn btn-danger" message="Remettre à zéro les duels de tout le monde ? C'est définitif.">
          Remettre à zéro
        </ConfirmButton>
      </form>
    </section>
  );
}
