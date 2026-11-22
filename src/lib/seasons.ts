import { prisma } from "@/lib/prisma";
import { announceText } from "@/lib/announce";
import { siteUrl } from "@/lib/discord";
import { checkAchievements } from "@/lib/achievements-server";
import { addCoins, getShopConfig } from "@/lib/coins";
import { MIN_SEASON_DUELS, softReset, START_RATING } from "@/lib/elo";

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

export type SeasonRow = { userId: string; name: string | null; featuredBadge: string | null; rating: number; wins: number; losses: number; duels: number };

/** Victoires, défaites et duels de chaque membre (contre des membres, hors tournois) sur un mois. */
async function monthStats(key: string) {
  const [from, to] = monthRange(key);
  const rows = await prisma.$queryRaw<{ userId: string; wins: bigint; losses: bigint; duels: bigint }[]>`
    SELECT "userId", SUM(win) AS wins, SUM(loss) AS losses, COUNT(*) AS duels FROM (
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
    GROUP BY "userId"`;
  return new Map(rows.map((r) => [r.userId, { wins: Number(r.wins), losses: Number(r.losses), duels: Number(r.duels) }]));
}

/**
 * Classement d'une saison : par cote Elo, parmi les membres qui ont disputé au moins
 * MIN_SEASON_DUELS duels dans le mois (en attaque ou en défense).
 */
export async function seasonRanking(key: string, limit = 10): Promise<SeasonRow[]> {
  const stats = await monthStats(key);
  const eligible = [...stats].filter(([, s]) => s.duels >= MIN_SEASON_DUELS).map(([id]) => id);
  const users = await prisma.user.findMany({
    where: { id: { in: eligible } },
    select: { id: true, name: true, featuredBadge: true, duelRating: true },
    orderBy: { duelRating: "desc" },
    take: limit,
  });
  return users.map((u) => ({ userId: u.id, name: u.name, featuredBadge: u.featuredBadge, rating: u.duelRating, ...stats.get(u.id)! }));
}

/** Duels disputés par un membre ce mois-ci (pour savoir s'il est classé). */
export async function myMonthDuels(userId: string, key: string) {
  return (await monthStats(key)).get(userId)?.duels ?? 0;
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
    // Nouvelle saison : chaque cote se rapproche de 1000 (la moitié de l'écart est gardée)
    const rated = await tx.user.findMany({ where: { NOT: { duelRating: START_RATING } }, select: { id: true, duelRating: true } });
    for (const u of rated) await tx.user.update({ where: { id: u.id }, data: { duelRating: softReset(u.duelRating) } });
  });
  for (const p of podium) await checkAchievements(p.userId);
  if (podium.length) {
    const lines = podium.map((p, i) => `${MEDALS[i]} **${p.name}** : cote ${p.rating} (${p.wins} V · ${p.losses} D, +${SEASON_REWARDS[i]} booster${SEASON_REWARDS[i] > 1 ? "s" : ""})`);
    const link = siteUrl("/duels");
    await announceText(`⚔ **Fin de la saison de duel ${deMonth(key)} !**\n${lines.join("\n")}\nUne nouvelle saison commence : les cotes se rapprochent de 1000 !${link ? ` ${link}` : ""}`);
  }
}
