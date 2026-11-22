import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { ConfirmButton } from "@/components/ConfirmButton";
import { createSeries, deleteSeries, updateSeries } from "../series-actions";

export const dynamic = "force-dynamic";

export default async function SeriesAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireStaff("manageSeries");
  const { ok, err } = await searchParams;
  const series = await prisma.series.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { cards: true } } } });
  return (
    <section className="admin">
      <h1>🌸 Séries</h1>
      {err && <p className="error">{err}</p>}
      {ok && <p className="success">{ok}</p>}
        <div className="panel admin-series" id="saisons">
          <p className="muted small-text">
            Chaque carte appartient à une série. Seules les séries cochées « dans les boosters » sortent des boosters ; les
            autres restent dans les collections et s&apos;obtiennent par échange. Chaque série a sa propre barre de
            progression dans la collection.
          </p>
          <ul className="series-list">
            {series.map((x) => (
              <li key={x.id}>
                <form action={updateSeries} className="series-row">
                  <input type="hidden" name="id" value={x.id} />
                  <input name="name" defaultValue={x.name} maxLength={40} required aria-label="Nom de la série" />
                  <input name="description" defaultValue={x.description} maxLength={200} placeholder="Description" aria-label="Description" />
                  <label className="switch">
                    <input type="checkbox" name="inBoosters" defaultChecked={x.inBoosters} />
                    <span>Dans les boosters</span>
                  </label>
                  {!x.inBoosters && (
                    <label className="switch">
                      <input type="checkbox" name="announce" defaultChecked />
                      <span>Annoncer sur Discord si je l&apos;ajoute</span>
                    </label>
                  )}
                  <span className="muted small-text">{x._count.cards} carte(s)</span>
                  <button className="btn btn-sm">Enregistrer</button>
                </form>
                <form action={deleteSeries}>
                  <input type="hidden" name="id" value={x.id} />
                  <ConfirmButton className="btn btn-sm btn-danger" message={`Supprimer la série ${x.name} ? Ses cartes ne sont pas supprimées : elles passent « hors série ».`}>
                    Supprimer
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
          <form action={createSeries} className="series-row series-new">
            <input name="name" maxLength={40} required placeholder="Nom de la nouvelle série (ex : Saison 2 : Les Ombres)" aria-label="Nom" />
            <input name="description" maxLength={200} placeholder="Description (facultatif)" aria-label="Description" />
            <label className="switch">
              <input type="checkbox" name="inBoosters" />
              <span>Dans les boosters tout de suite</span>
            </label>
            <button className="btn btn-sm">+ Créer la série</button>
          </form>
          <p className="muted small-text">
            Conseil : crée la série sans la mettre dans les boosters, ajoute ses cartes, puis coche « Dans les boosters » le
            jour de la sortie (avec l&apos;annonce Discord).
          </p>
        </div>
    </section>
  );
}
