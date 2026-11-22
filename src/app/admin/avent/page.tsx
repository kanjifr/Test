import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { adventToday, getAdventConfig, KIND_LABELS, rewardText, type AdventReward } from "@/lib/advent";
import { RARITIES, RARITY_ORDER } from "@/lib/game";
import { saveAdvent } from "./actions";

export const dynamic = "force-dynamic";

const amount = (r: AdventReward) => (r.kind === "boosters" || r.kind === "coins" || r.kind === "pity" ? r.n : r.kind === "xmas" ? r.boosters : "");
const rarity = (r: AdventReward) => (r.kind === "card" || r.kind === "shiny" ? r.rarity : r.kind === "xmas" ? (r.rarity ?? "") : "");

export default async function AdventAdmin({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await requireStaff("manageAdvent");
  const { ok } = await searchParams;
  const t = adventToday();
  const cfg = await getAdventConfig();
  const [perDay, xmasCards] = await Promise.all([
    prisma.adventClaim.groupBy({ by: ["day"], where: { year: t.year }, _count: true }),
    prisma.card.findMany({ where: { active: true, exclusive: true, eventName: cfg.eventName }, select: { id: true, name: true, rarity: true }, orderBy: { number: "asc" } }),
  ]);
  const opened = new Map(perDay.map((p) => [p.day, p._count]));

  return (
    <section className="admin">
      <div className="page-head">
        <h1>🎄 Calendrier de l&apos;Avent</h1>
        <Link href="/admin">← Panel admin</Link>
      </div>
      {ok && <p className="success">Calendrier enregistré ✔</p>}

      <div className="panel">
        <h2>Cartes de Noël exclusives ({xmasCards.length})</h2>
        <p className="muted small-text">
          Crée-les dans le panel admin avec <b>Carte d&apos;événement = « {cfg.eventName} »</b> et coche <b>Exclusive</b> : elles ne sortiront
          jamais des boosters, seulement du calendrier (cases « Carte de Noël »). Pense à une Légendaire pour le 24. Sans carte de Noël,
          ces cases donnent une carte Rare ou mieux à la place.
        </p>
        {xmasCards.length > 0 ? (
          <p>
            {xmasCards.map((c, i) => (
              <span key={c.id}>
                {i > 0 && " · "}
                <span style={{ color: RARITIES[c.rarity].color }}>{c.name}</span> ({RARITIES[c.rarity].label})
              </span>
            ))}
          </p>
        ) : (
          <p className="error">Aucune carte de Noël pour le moment.</p>
        )}
        {!xmasCards.some((c) => c.rarity === "LEGENDAIRE") && <p className="muted small-text">⚠ Pas encore de Légendaire de Noël pour le grand cadeau du 24.</p>}
      </div>

      <form action={saveAdvent} className="panel advent-admin">
        <h2>Les 24 cases</h2>
        <div className="row">
          <label>
            Nom d&apos;événement des cartes de Noël
            <input name="eventName" defaultValue={cfg.eventName} maxLength={30} />
          </label>
          <label>
            Cases minimum pour le grand cadeau du 24
            <input type="number" name="grandMin" min={1} max={24} defaultValue={cfg.grandMin} />
          </label>
        </div>
        <table className="advent-table">
          <thead>
            <tr>
              <th>Case</th>
              <th>Cadeau</th>
              <th>Nombre</th>
              <th>Rareté</th>
              <th>Ouvertures {t.year}</th>
            </tr>
          </thead>
          <tbody>
            {cfg.days.map((d, i) => (
              <tr key={i} className={t.day === i + 1 ? "today" : ""}>
                <td>
                  <b>{i + 1}</b>
                </td>
                <td>
                  <select name={`kind${i}`} defaultValue={d.kind} aria-label={`Cadeau de la case ${i + 1}`}>
                    {Object.entries(KIND_LABELS).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <small className="muted"> {rewardText(d)}</small>
                </td>
                <td>
                  <input type="number" name={`n${i}`} min={0} max={5000} defaultValue={amount(d)} aria-label="Nombre (boosters, pièces, jauge)" />
                </td>
                <td>
                  <select name={`rarity${i}`} defaultValue={rarity(d)} aria-label="Rareté">
                    <option value="">—</option>
                    {RARITY_ORDER.map((r) => (
                      <option key={r} value={r}>
                        {RARITIES[r].label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{opened.get(i + 1) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small-text">
          Nombre = boosters, pièces ou avance de la jauge Mythique selon le cadeau ; pour une carte de Noël, ce sont les boosters offerts en
          plus. Rareté = minimum pour une carte au hasard, ou rareté exacte d&apos;une carte de Noël (vide = au hasard).
        </p>
        <div className="row">
          <button className="btn">Enregistrer le calendrier</button>
          <button className="btn btn-ghost" name="reset" value="1">
            Revenir au calendrier par défaut
          </button>
        </div>
      </form>
    </section>
  );
}
