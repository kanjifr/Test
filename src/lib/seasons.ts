import { prisma } from "@/lib/prisma";
import { announceText } from "@/lib/announce";
import { siteUrl } from "@/lib/discord";
import { checkAchievements } from "@/lib/achievements-server";
import { addCoins, getShopConfig } from "@/lib/coins";

/** Boosters bonus pour le podium d'une saison de duel (1er, 2e, 3e). */
export const SEASON_REWARDS = [3, 2, 1];
export const MEDALS = ["🥇", "🥈", "🥉"];

const parisParts = (d: Date) => {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).format(d).split("-");
  return { y: Number(y), m: Number(m) };
};

/** Mois en cours à l'heure de Paris, ex : « 2026-11 ». */
export function monthKey(d = new Date()) {
  const { y, m } = parisParts(d);
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function previousMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Premier jour du mois à minuit, heure de Paris. */
function parisMonthStart(y: number, m: number) {
  const utc = new Date(Date.UTC(y, m - 1, 1));
  const paris = new Date(utc.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const asUtc = new Date(utc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(utc.getTime() - (paris.getTime() - asUtc.getTime()));
}

export function monthRange(key: string): [Date, Date] {
  const [y, m] = key.split("-").map(Number);
  return [parisMonthStart(y, m), m === 12 ? parisMonthStart(y + 1, 1) : parisMonthStart(y, m + 1)];
}

/** « de novembre 2026 » / « d'octobre 2026 » (élision devant une voyelle) */
export const deMonth = (key: string) => {
  const l = monthLabel(key);
  return /^[aeiouéèêh]/i.test(l) ? `d'${l}` : `de ${l}`;
};

/** « novembre 2026 » */
export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

export type SeasonRow = { userId: string; name: string | null; featuredBadge: string | null; wins: number; losses: number };

/** Classement d'une saison : victoires et défaites contre des membres (attaque et défense). */
export async function seasonRanking(key: string, limit = 10): Promise<SeasonRow[]> {
  const [from, to] = monthRange(key);
  const rows = await prisma.$queryRaw<{ userId: string; wins: bigint; losses: bigint }[]>`
    SELECT "userId", SUM(win) AS wins, SUM(loss) AS losses FROM (
      SELECT "attackerId" AS "userId",
             CASE WHEN result = 'ATTACKER' THEN 1 ELSE 0 END AS win,
             CASE WHEN result = 'DEFENDER' THEN 1 ELSE 0 END AS loss
        FROM "Duel" WHERE "defenderId" IS NOT NULL AND "tournamentId" IS NULL AND "createdAt" >= ${from} AND "createdAt" < ${to}
      UNION ALL
      SELECT "defenderId",
             CASE WHEN result = 'DEFENDER' THEN 1 ELSE 0 END,
             CASE WHEN result = 'ATTACKER' THEN 1 ELSE 0 END
        FROM "Duel" WHERE "defenderId" IS NOT NULL AND "tournamentId" IS NULL AND "createdAt" >= ${from} AND "createdAt" < ${to}
    ) t
    GROUP BY "userId"
    HAVING SUM(win) > 0
    ORDER BY SUM(win) DESC, SUM(loss) ASC
    LIMIT ${limit}`;
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, name: true, featuredBadge: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows
    .filter((r) => byId.has(r.userId))
    .map((r) => ({ userId: r.userId, name: byId.get(r.userId)!.name, featuredBadge: byId.get(r.userId)!.featuredBadge, wins: Number(r.wins), losses: Number(r.losses) }));
}

/** Clôture la saison du mois précédent : titres et boosters pour le podium (une seule fois). */
export async function finalizeDuelSeason(now = new Date()) {
  const key = previousMonth(monthKey(now));
  const done = `season:duel:${key}`;
  if (await prisma.setting.findUnique({ where: { key: done } })) return;
  const podium = (await seasonRanking(key, 3)).slice(0, 3);
  const shop = await getShopConfig();
  await prisma.$transaction(async (tx) => {
    // Le réglage sert de verrou : une deuxième instance échouerait ici
    await tx.setting.create({ data: { key: done, value: String(podium.length) } });
    for (const [i, p] of podium.entries()) {
      await tx.seasonAward.create({
        data: { kind: "DUEL_MONTH", period: key, rank: i + 1, userId: p.userId, label: i === 0 ? `Champion ${deMonth(key)}` : `${i + 1}e de la saison ${deMonth(key)}` },
      });
      await tx.user.update({ where: { id: p.userId }, data: { bonusPacks: { increment: SEASON_REWARDS[i] } } });
      if (shop.season[i]) await addCoins(tx, p.userId, shop.season[i], `Podium de la saison de duel ${key}`);
    }
  });
  for (const p of podium) await checkAchievements(p.userId);
  if (podium.length) {
    const lines = podium.map((p, i) => `${MEDALS[i]} **${p.name}** : ${p.wins} victoire${p.wins > 1 ? "s" : ""} (+${SEASON_REWARDS[i]} booster${SEASON_REWARDS[i] > 1 ? "s" : ""})`);
    const link = siteUrl("/duels");
    await announceText(`⚔ **Fin de la saison de duel ${deMonth(key)} !**\n${lines.join("\n")}\nUne nouvelle saison commence, tout le monde repart à zéro !${link ? ` ${link}` : ""}`);
  }
}
