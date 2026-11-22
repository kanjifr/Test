import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { fmtCoins, getShopConfig } from "@/lib/coins";
import { cardPrice, shopCardWhere } from "@/lib/shop";
import { toCardView } from "@/lib/cards";
import { RARITIES, RARITY_ORDER } from "@/lib/game";
import { weekEnd } from "@/lib/quests";
import { GameCard } from "@/components/GameCard";
import { ConfirmButton } from "@/components/ConfirmButton";
import { buyBooster, buyCard } from "./actions";

export const dynamic = "force-dynamic";

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; rarete?: string; tout?: string }> }) {
  const me = await requireUser();
  const { ok, err, rarete, tout } = await searchParams;
  const shop = await getShopConfig();
  const weekStart = new Date(weekEnd().getTime() - 7 * 86400_000);
  const rarity = RARITY_ORDER.includes(rarete as never) ? (rarete as (typeof RARITY_ORDER)[number]) : null;
  const [user, cards, owned, history, boughtThisWeek] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { coins: true } }),
    prisma.card.findMany({
      where: { AND: [shopCardWhere(), rarity ? { rarity } : {}] },
      orderBy: { number: "asc" },
      include: { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } },
    }),
    prisma.userCard.findMany({ where: { userId: me.id }, select: { cardId: true, count: true } }),
    prisma.coinLog.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.coinLog.count({ where: { userId: me.id, reason: "Achat : booster", createdAt: { gte: weekStart } } }),
  ]);
  const counts = new Map(owned.map((o) => [o.cardId, o.count]));
  // Par défaut : seulement les cartes qui manquent
  const list = tout ? cards : cards.filter((c) => !counts.get(c.id));
  const boostersLeft = Math.max(0, shop.boostersPerWeek - boughtThisWeek);
  const q = (p: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ rarete: rarity ?? undefined, tout, ...p })) if (v) sp.set(k, v);
    const s = sp.toString();
    return `/boutique${s ? `?${s}` : ""}`;
  };

  return (
    <section className="shop">
      <div className="page-head">
        <h1>🪙 Boutique</h1>
        <span className="coin-balance" aria-label={`${user.coins} pièces`}>
          🪙 <b>{fmtCoins(user.coins)}</b> pièces
        </span>
      </div>
      {ok && <p className="success">{ok}</p>}
      {err && <p className="error">{err}</p>}

      <div className="shop-top">
        <div className="panel shop-booster">
          <h2>🎁 Booster</h2>
          <p className="muted small-text">
            S&apos;ajoute à tes boosters bonus. {boostersLeft} achat{boostersLeft > 1 ? "s" : ""} restant{boostersLeft > 1 ? "s" : ""} cette semaine (max{" "}
            {shop.boostersPerWeek}).
          </p>
          <form action={buyBooster}>
            <ConfirmButton className="btn" message={`Acheter un booster pour ${fmtCoins(shop.booster)} pièces ?`} disabled={user.coins < shop.booster || boostersLeft === 0}>
              Acheter · 🪙 {fmtCoins(shop.booster)}
            </ConfirmButton>
          </form>
        </div>
        <div className="panel shop-earn">
          <h2>Gagner des pièces</h2>
          <ul className="small-text">
            <li>⚔ Duel contre un membre : <b>{shop.duelWin}</b> si tu gagnes, <b>{shop.duelLoss}</b> sinon</li>
            <li>📜 Quête de la semaine terminée : <b>{shop.quest}</b></li>
            <li>🏆 Tournoi : <b>{shop.tournamentPlay}</b> pour participer, <b>{shop.tournamentFinal}</b> en finale, <b>{shop.tournamentWin}</b> pour le vainqueur</li>
            <li>🏅 Podium de la saison de duel : <b>{shop.season.join(" / ")}</b></li>
          </ul>
        </div>
      </div>

      <div className="panel">
        <h2>Cartes à l&apos;unité</h2>
        <p className="muted small-text">
          Prix : {(["COMMUNE", "RARE", "EPIQUE", "LEGENDAIRE"] as const).map((r, i) => (
            <span key={r}>
              {i > 0 && " · "}
              <span style={{ color: RARITIES[r].color }}>{RARITIES[r].label}</span> {fmtCoins(shop.prices[r])}
            </span>
          ))}
          . Versions alternatives +50 %. Les Mythiques, les brillantes et les cartes d&apos;événement ne sont pas en vente.
        </p>
        <div className="chips">
          <Link className={`chip ${!rarity ? "on" : ""}`} href={q({ rarete: undefined })}>
            Toutes
          </Link>
          {(["COMMUNE", "RARE", "EPIQUE", "LEGENDAIRE"] as const).map((r) => (
            <Link key={r} className={`chip ${rarity === r ? "on" : ""}`} href={q({ rarete: r })}>
              {RARITIES[r].label}
            </Link>
          ))}
          <Link className="chip" href={q({ tout: tout ? undefined : "1" })}>
            {tout ? "☑" : "☐"} Afficher aussi celles que j&apos;ai
          </Link>
        </div>
        {list.length === 0 ? (
          <p className="muted">{tout ? "Aucune carte en vente." : "Tu as déjà toutes les cartes en vente de cette rareté !"}</p>
        ) : (
          <div className="shop-grid">
            {list.map((c) => {
              const price = cardPrice(c, shop);
              const have = counts.get(c.id) ?? 0;
              return (
                <div key={c.id} className="shop-item">
                  <GameCard card={toCardView(c)} size="sm" count={have || undefined} />
                  <form action={buyCard}>
                    <input type="hidden" name="cardId" value={c.id} />
                    <ConfirmButton className="btn btn-sm" message={`Acheter ${c.name} pour ${fmtCoins(price)} pièces ?`} disabled={user.coins < price}>
                      🪙 {fmtCoins(price)}
                    </ConfirmButton>
                  </form>
                  {have > 0 && <small className="muted">Tu en as {have}</small>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Historique</h2>
        {history.length === 0 ? (
          <p className="muted">Aucune pièce gagnée pour le moment. Lance un duel !</p>
        ) : (
          <ul className="coin-history">
            {history.map((h) => (
              <li key={h.id}>
                <span className={h.amount > 0 ? "plus" : "minus"}>
                  {h.amount > 0 ? "+" : ""}
                  {fmtCoins(h.amount)}
                </span>
                <span>{h.reason}</span>
                <time className="muted small-text">{h.createdAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}</time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
