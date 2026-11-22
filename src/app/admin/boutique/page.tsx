import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { fmtCoins, getShopConfig } from "@/lib/coins";
import { giftCoins, saveShop } from "./actions";

export const dynamic = "force-dynamic";

function Field({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <label>
      {label}
      <input type="number" name={name} min={0} defaultValue={value} />
    </label>
  );
}

export default async function ShopAdmin({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await requireStaff("manageShop");
  const { ok } = await searchParams;
  const [shop, members, total, spent] = await Promise.all([
    getShopConfig(),
    prisma.user.findMany({ orderBy: { coins: "desc" }, select: { id: true, name: true, coins: true } }),
    prisma.user.aggregate({ _sum: { coins: true } }),
    prisma.coinLog.aggregate({ _sum: { amount: true }, where: { amount: { lt: 0 } } }),
  ]);

  return (
    <section className="admin">
      <div className="page-head">
        <h1>🪙 Boutique et pièces</h1>
      </div>
      {ok === "1" && <p className="success">Réglages enregistrés ✔</p>}
      {ok === "2" && <p className="success">Pièces envoyées ✔</p>}
      <div className="stats">
        <div>
          <b>{fmtCoins(total._sum.coins ?? 0)}</b> pièces en circulation
        </div>
        <div>
          <b>{fmtCoins(-(spent._sum.amount ?? 0))}</b> pièces dépensées
        </div>
      </div>

      <form action={saveShop} className="panel shop-admin">
        <h2>Prix</h2>
        <div className="row">
          <Field name="booster" label="Booster" value={shop.booster} />
          <Field name="boostersPerWeek" label="Boosters achetables / semaine" value={shop.boostersPerWeek} />
        </div>
        <div className="row">
          <Field name="COMMUNE" label="Carte Commune" value={shop.prices.COMMUNE} />
          <Field name="RARE" label="Carte Rare" value={shop.prices.RARE} />
          <Field name="EPIQUE" label="Carte Épique" value={shop.prices.EPIQUE} />
          <Field name="LEGENDAIRE" label="Carte Légendaire" value={shop.prices.LEGENDAIRE} />
        </div>
        <h2>Gains</h2>
        <div className="row">
          <Field name="duelWin" label="Duel gagné" value={shop.duelWin} />
          <Field name="duelLoss" label="Duel perdu" value={shop.duelLoss} />
          <Field name="quest" label="Quête terminée" value={shop.quest} />
        </div>
        <div className="row">
          <Field name="tournamentPlay" label="Tournoi : participation" value={shop.tournamentPlay} />
          <Field name="tournamentFinal" label="Tournoi : finaliste" value={shop.tournamentFinal} />
          <Field name="tournamentWin" label="Tournoi : vainqueur" value={shop.tournamentWin} />
        </div>
        <div className="row">
          <Field name="season0" label="Saison : 1er" value={shop.season[0]} />
          <Field name="season1" label="Saison : 2e" value={shop.season[1]} />
          <Field name="season2" label="Saison : 3e" value={shop.season[2]} />
        </div>
        <p className="muted small-text">
          Repère : un joueur très actif gagne environ 500 à 600 pièces par semaine (10 duels par jour + 3 quêtes). Avec les prix par
          défaut, ça fait une Commune par semaine et une Légendaire en 2 à 3 mois.
        </p>
        <div className="row">
          <button className="btn">Enregistrer</button>
          <button className="btn btn-ghost" name="reset" value="1">
            Revenir aux réglages par défaut
          </button>
        </div>
      </form>

      <form action={giftCoins} className="panel row">
        <h2 style={{ width: "100%", margin: 0 }}>Donner (ou retirer) des pièces</h2>
        <label>
          Membre
          <select name="userId">
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({fmtCoins(m.coins)})
              </option>
            ))}
          </select>
        </label>
        <label>
          Montant (négatif pour retirer)
          <input type="number" name="amount" defaultValue={100} />
        </label>
        <button className="btn">Valider</button>
      </form>
    </section>
  );
}
