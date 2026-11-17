import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { toCardView } from "@/lib/cards";
import { GameCard } from "@/components/GameCard";
import { ELEMENTS, ELEMENT_KEYS, RARITIES, RARITY_ORDER } from "@/lib/game";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteCard, resetCooldown, saveCard, seedDemo, toggleCard } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; err?: string; ok?: string }>;
}) {
  await requireAdmin();
  const { edit, err, ok } = await searchParams;

  const [cards, members, stats] = await Promise.all([
    prisma.card.findMany({
      orderBy: { number: "asc" },
      include: {
        subject: { select: { image: true, consent: true, name: true } },
        _count: { select: { owners: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, consent: true, packsOpened: true, lastPackAt: true },
    }),
    prisma.user.aggregate({ _sum: { packsOpened: true }, _count: true }),
  ]);
  const editing = edit ? cards.find((c) => c.id === edit) : undefined;
  const consenting = members.filter((m) => m.consent);

  return (
    <section className="admin">
      <h1>Panel admin</h1>
      <div className="stats">
        <div>
          <b>{stats._count}</b> membres
        </div>
        <div>
          <b>{cards.length}</b> cartes
        </div>
        <div>
          <b>{stats._sum.packsOpened ?? 0}</b> boosters ouverts
        </div>
      </div>

      {err && <p className="error">{err}</p>}
      {ok && <p className="success">Carte enregistrée ✔</p>}

      <div className="admin-cols">
        <form action={saveCard} className="panel card-form" key={editing?.id ?? "new"}>
          <h2>{editing ? `Modifier #${editing.number} ${editing.name}` : "Nouvelle carte"}</h2>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <label>
            Nom *
            <input name="name" required maxLength={40} defaultValue={editing?.name} />
          </label>
          <label>
            Titre / surnom
            <input name="title" maxLength={40} defaultValue={editing?.title} placeholder="ex : La lame du crépuscule" />
          </label>
          <label>
            Description
            <textarea name="description" maxLength={300} rows={3} defaultValue={editing?.description} />
          </label>
          <div className="row">
            <label>
              Rareté
              <select name="rarity" defaultValue={editing?.rarity ?? "COMMUNE"}>
                {RARITY_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {RARITIES[r].label} ({RARITIES[r].weight}%)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Élément
              <select name="element" defaultValue={editing?.element ?? "EAU"}>
                {ELEMENT_KEYS.map((e) => (
                  <option key={e} value={e}>
                    {ELEMENTS[e].kanji} {ELEMENTS[e].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            <label>
              Attaque
              <input type="number" name="attack" min={0} max={999} defaultValue={editing?.attack ?? 50} />
            </label>
            <label>
              Défense
              <input type="number" name="defense" min={0} max={999} defaultValue={editing?.defense ?? 50} />
            </label>
          </div>
          <label>
            Membre représenté (avatar Discord utilisé si pas d&apos;image)
            <select name="subjectId" defaultValue={editing?.subjectId ?? ""}>
              <option value="">— Aucun —</option>
              {consenting.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <small className="muted">Seuls les membres ayant accepté dans leur profil apparaissent ici.</small>
          </label>
          <label>
            Image (PNG, JPG, WEBP, GIF · 5 Mo max)
            <input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" />
          </label>
          <label>
            … ou URL d&apos;image (https://)
            <input
              name="imageUrl"
              type="url"
              defaultValue={editing?.imageUrl?.startsWith("https://") ? editing.imageUrl : ""}
            />
          </label>
          {editing?.imageUrl && (
            <label className="switch">
              <input type="checkbox" name="removeImage" />
              <span>Retirer l&apos;image actuelle</span>
            </label>
          )}
          <div className="row">
            <button type="submit" className="btn">
              {editing ? "Enregistrer" : "Créer la carte"}
            </button>
            {editing && (
              <Link href="/admin" className="btn btn-ghost">
                Annuler
              </Link>
            )}
          </div>
        </form>

        <div className="admin-cards">
          {cards.length === 0 && (
            <form action={seedDemo} className="panel">
              <p>Aucune carte. Tu peux créer 12 cartes d&apos;exemple pour tester le site.</p>
              <button type="submit" className="btn">
                Créer les cartes de démo
              </button>
            </form>
          )}
          {cards.map((c) => (
            <div key={c.id} className={`admin-card ${c.active ? "" : "inactive"}`}>
              <GameCard card={toCardView(c)} size="sm" />
              <div className="admin-card-info">
                <b>{c.name}</b>
                <span className="muted">
                  {c.subject ? `Membre : ${c.subject.name}` : "Pas de membre lié"} · {c._count.owners} possesseurs
                </span>
                <div className="row">
                  <Link href={`/admin?edit=${c.id}`} className="btn btn-sm">
                    Modifier
                  </Link>
                  <form action={toggleCard}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="btn btn-sm btn-ghost">{c.active ? "Désactiver" : "Activer"}</button>
                  </form>
                  <form action={deleteCard}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmButton
                      className="btn btn-sm btn-danger"
                      message={`Supprimer ${c.name} ? Elle disparaîtra de toutes les collections.`}
                    >
                      Supprimer
                    </ConfirmButton>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Membres</h2>
        <table className="members">
          <thead>
            <tr>
              <th>Membre</th>
              <th>Accord carte</th>
              <th>Boosters</th>
              <th>Dernier booster</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{m.consent ? "✔ Oui" : "—"}</td>
                <td>{m.packsOpened}</td>
                <td>{m.lastPackAt ? m.lastPackAt.toLocaleString("fr-FR") : "—"}</td>
                <td>
                  <form action={resetCooldown}>
                    <input type="hidden" name="userId" value={m.id} />
                    <button className="btn btn-sm btn-ghost">Offrir un booster</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
