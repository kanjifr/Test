import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can, ROLE_LABELS, staffRole } from "@/lib/admin";
import { ConfirmButton } from "@/components/ConfirmButton";
import { resetCollection, resetCooldown, setRole } from "../actions";

export const dynamic = "force-dynamic";

export default async function MembersAdmin({ searchParams }: { searchParams: Promise<{ q?: string; filtre?: string }> }) {
  const me = await requireStaff("viewPanel");
  const { q, filtre } = await searchParams;
  const allow = { roles: can(me.role, "manageRoles"), gift: can(me.role, "giftBoosters"), reset: can(me.role, "resetCollections") };
  const search = (q ?? "").trim().slice(0, 40);
  const all = await prisma.user.findMany({
    where: search ? { name: { contains: search, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
    select: { id: true, name: true, consent: true, packsOpened: true, bonusPacks: true, lastPackAt: true, role: true, discordId: true, _count: { select: { cards: true } } },
  });
  const members = all.filter((m) =>
    filtre === "staff" ? !!staffRole(m.discordId, m.role) : filtre === "accord" ? m.consent : filtre === "inactifs" ? !m.lastPackAt || m.lastPackAt < new Date(Date.now() - 14 * 86400_000) : true,
  );
  const filters = [
    ["", "Tous"],
    ["staff", "Staff"],
    ["accord", "Ont accepté d'apparaître sur une carte"],
    ["inactifs", "Inactifs depuis 14 jours"],
  ] as const;

  return (
    <section className="admin">
      <h1>👥 Membres</h1>
      <form className="admin-toolbar" method="get">
        <input type="search" name="q" defaultValue={search} placeholder="Rechercher un pseudo…" aria-label="Rechercher un membre" />
        {filtre && <input type="hidden" name="filtre" value={filtre} />}
        <button className="btn btn-sm">Rechercher</button>
        <span className="muted small-text">{members.length} membre{members.length > 1 ? "s" : ""}</span>
      </form>
      <div className="chips">
        {filters.map(([v, label]) => (
          <Link key={v} className={`chip ${(filtre ?? "") === v ? "on" : ""}`} href={`/admin/membres?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(v ? { filtre: v } : {}) })}`}>
            {label}
          </Link>
        ))}
      </div>
      <div className="panel">
        <div className="table-scroll">
        <table className="members">
          <thead>
            <tr>
              <th>Membre</th>
              <th>Rôle</th>
              <th>Accord carte</th>
              <th>Boosters</th>
              <th>Cartes</th>
              <th>Dernier booster</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const r = staffRole(m.discordId, m.role);
              return (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>
                  {allow.roles && r !== "OWNER" && m.id !== me.id ? (
                    <form action={setRole} className="role-form" key={m.role}>
                      <input type="hidden" name="userId" value={m.id} />
                      <select name="role" defaultValue={m.role} aria-label={`Rôle de ${m.name}`}>
                        <option value="MEMBER">{ROLE_LABELS.MEMBER}</option>
                        <option value="MODERATOR">{ROLE_LABELS.MODERATOR}</option>
                        <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>
                      </select>
                      <button className="btn btn-sm btn-ghost">OK</button>
                    </form>
                  ) : (
                    <span className={r ? "role-chip" : "muted"}>{ROLE_LABELS[r ?? "MEMBER"]}</span>
                  )}
                </td>
                <td>{m.consent ? "✔ Oui" : "—"}</td>
                <td>
                  {m.packsOpened}
                  {m.bonusPacks > 0 && <span className="muted"> (+{m.bonusPacks} 🎁)</span>}
                </td>
                <td>{m._count.cards}</td>
                <td>{m.lastPackAt ? m.lastPackAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }) : "—"}</td>
                <td>
                  <div className="member-actions">
                    {allow.gift && (
                      <form action={resetCooldown}>
                        <input type="hidden" name="userId" value={m.id} />
                        <button className="btn btn-sm btn-ghost">🎁 Offrir un booster</button>
                      </form>
                    )}
                    {allow.reset && (r !== "OWNER" || me.role === "OWNER") && (
                      <details className="reset-menu">
                        <summary className="btn btn-sm btn-danger">Réinitialiser…</summary>
                        <form action={resetCollection} className="reset-form">
                          <input type="hidden" name="userId" value={m.id} />
                          <p>
                            Supprime toutes les cartes de <b>{m.name}</b> ({m._count.cards} différente(s)) et annule ses
                            échanges en attente.
                          </p>
                          <label className="switch">
                            <input type="checkbox" name="achievements" />
                            <span>Réinitialiser aussi ses succès et son compteur de boosters</span>
                          </label>
                          <ConfirmButton
                            className="btn btn-sm btn-danger"
                            message={`Réinitialiser la collection de ${m.name} ? C'est définitif.`}
                          >
                            Confirmer la réinitialisation
                          </ConfirmButton>
                        </form>
                      </details>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {allow.roles && (
          <p className="muted small">
            <b>Admin</b> : tous les droits sauf la gestion des rôles. <b>Modérateur</b> : créer et modifier des cartes
            uniquement. Les propriétaires se définissent dans la variable <code>OWNER_DISCORD_IDS</code>.
          </p>
        )}
      </div>
    </section>
  );
}
