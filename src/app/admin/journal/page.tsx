import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

const KINDS = [
  ["", "Tout"],
  ["card", "Cartes"],
  ["series", "Séries"],
  ["role", "Rôles"],
  ["booster", "Boosters offerts"],
  ["coins", "Pièces"],
  ["collection", "Réinitialisations"],
  ["tournament", "Tournois"],
  ["anecdote", "Livre d'or"],
  ["backup", "Sauvegardes"],
] as const;

export default async function LogAdmin({ searchParams }: { searchParams: Promise<{ type?: string; page?: string }> }) {
  await requireStaff("viewLog");
  const { type, page } = await searchParams;
  const kind = KINDS.some(([k]) => k === type) ? (type ?? "") : "";
  const p = Math.max(1, Math.floor(Number(page)) || 1);
  const where = kind ? { action: { startsWith: `${kind}.` } } : {};
  const [logs, total] = await Promise.all([
    prisma.adminLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, skip: (p - 1) * 100 }),
    prisma.adminLog.count({ where }),
  ]);
  const link = (o: { type?: string; page?: number }) => {
    const sp = new URLSearchParams();
    if (o.type ?? kind) sp.set("type", o.type ?? kind);
    if (o.page && o.page > 1) sp.set("page", String(o.page));
    return `/admin/journal${sp.size ? `?${sp}` : ""}`;
  };
  return (
    <section className="admin">
      <h1>📜 Journal des actions</h1>
      <div className="chips">
        {KINDS.map(([k, label]) => (
          <Link key={k} className={`chip ${kind === k ? "on" : ""}`} href={k ? `/admin/journal?type=${k}` : "/admin/journal"}>
            {label}
          </Link>
        ))}
      </div>
      <div className="panel log-panel">
        {logs.length === 0 ? (
          <p className="muted">Aucune action.</p>
        ) : (
          <ul className="log">
            {logs.map((l) => (
              <li key={l.id}>
                <time className="muted">{l.createdAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}</time>
                <span>
                  <b>{l.actorName}</b> {l.details}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          {p > 1 && <Link className="btn btn-sm btn-ghost" href={link({ page: p - 1 })}>← Plus récentes</Link>}
          {p * 100 < total && <Link className="btn btn-sm btn-ghost" href={link({ page: p + 1 })}>Plus anciennes →</Link>}
          <span className="muted small-text">{total} action{total > 1 ? "s" : ""}</span>
        </div>
      </div>
    </section>
  );
}
