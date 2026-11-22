"use server";

import { randomInt } from "node:crypto";
import type { Rarity } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { adventToday, getAdventConfig, rewardText, type AdventReward } from "@/lib/advent";
import { PITY_HARD, RARITY_ORDER, type CardView } from "@/lib/game";
import { giveCopies } from "@/lib/copies";
import { addCoins } from "@/lib/coins";
import { boosterWhere } from "@/lib/series";
import { toCardView } from "@/lib/cards";
import { checkAchievements } from "@/lib/achievements-server";

export type AdventOpen =
  | { ok: true; day: number; label: string; card?: CardView & { isNew: boolean }; bonus?: number; consolation?: boolean }
  | { ok: false; error: string };

class AdventError extends Error {}
const pick = <T,>(list: T[]) => list[randomInt(0, list.length)];
const subject = { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } } as const;

/** Rareté tirée au minimum : la plus basse autorisée, avec une petite chance de mieux. */
function rollAtLeast(min: Rarity): Rarity[] {
  const i = RARITY_ORDER.indexOf(min);
  // Ordre d'essai : la rareté minimum le plus souvent, parfois au-dessus
  const up = RARITY_ORDER.slice(i, RARITY_ORDER.indexOf("LEGENDAIRE") + 1);
  const roll = randomInt(0, 100);
  const start = roll < 75 ? 0 : roll < 95 ? 1 : 2;
  return [...up.slice(Math.min(start, up.length - 1)), ...up.slice(0, Math.min(start, up.length - 1)).reverse()];
}

export async function openAdventDay(): Promise<AdventOpen> {
  const me = await requireUser();
  const t = adventToday();
  if (!t.day) return { ok: false, error: "Le calendrier de l'Avent n'est ouvert que du 1er au 24 décembre." };
  const day = t.day;
  const config = await getAdventConfig();
  let reward: AdventReward = config.days[day - 1];

  try {
    const result = await prisma.$transaction(async (tx) => {
      // La clé (membre, année, jour) empêche d'ouvrir deux fois la même case
      const opened = await tx.adventClaim.count({ where: { userId: me.id, year: t.year } });
      let consolation = false;
      if (day === 24 && reward.kind === "xmas" && opened + 1 < config.grandMin) {
        // Grand cadeau réservé aux membres assidus : lot de consolation
        reward = { kind: "boosters", n: 1 };
        consolation = true;
      }
      let card: (CardView & { isNew: boolean }) | undefined;
      let label = rewardText(reward);
      let bonus: number | undefined;

      const giveCard = async (where: object, shiny: boolean, rarities: Rarity[]) => {
        for (const r of rarities) {
          const list = await tx.card.findMany({ where: { ...where, rarity: r }, include: subject });
          if (list.length) {
            const c = pick(list);
            const owned = await giveCopies(tx, me.id, c.id, 1, shiny);
            await tx.pull.create({ data: { userId: me.id, cardId: c.id, isNew: owned.count === 1, shiny } });
            card = { ...toCardView(c), shiny, isNew: owned.count === 1 };
            return true;
          }
        }
        return false;
      };

      switch (reward.kind) {
        case "boosters": {
          const u = await tx.user.update({ where: { id: me.id }, data: { bonusPacks: { increment: reward.n } }, select: { bonusPacks: true } });
          bonus = u.bonusPacks;
          break;
        }
        case "coins":
          await addCoins(tx, me.id, reward.n, `Calendrier de l'Avent, case ${day}`);
          break;
        case "pity": {
          const u = await tx.user.findUniqueOrThrow({ where: { id: me.id }, select: { pityCount: true } });
          await tx.user.update({ where: { id: me.id }, data: { pityCount: Math.min(PITY_HARD - 1, u.pityCount + reward.n) } });
          break;
        }
        case "card":
        case "shiny": {
          const pool = { ...boosterWhere(), rarity: undefined };
          if (!(await giveCard(pool, reward.kind === "shiny", rollAtLeast(reward.rarity)))) throw new AdventError("Aucune carte disponible.");
          break;
        }
        case "xmas": {
          const r = reward;
          const xmas = { active: true, exclusive: true, eventName: config.eventName };
          // Rareté demandée d'abord, puis les autres ; sans rareté, ordre au hasard
          const shuffled = [...RARITY_ORDER];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = randomInt(0, i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          const wanted: Rarity[] = r.rarity ? [r.rarity, ...[...RARITY_ORDER].reverse().filter((x) => x !== r.rarity)] : shuffled;
          // Sans carte de Noël créée, on donne une carte Rare ou mieux à la place
          if (!(await giveCard(xmas, false, wanted)) && !(await giveCard({ ...boosterWhere() }, false, rollAtLeast(r.rarity === "LEGENDAIRE" ? "EPIQUE" : "RARE")))) {
            throw new AdventError("Aucune carte disponible.");
          }
          if (r.boosters) {
            const u = await tx.user.update({ where: { id: me.id }, data: { bonusPacks: { increment: r.boosters } }, select: { bonusPacks: true } });
            bonus = u.bonusPacks;
          }
          break;
        }
      }
      if (card) label = `${card.shiny ? "✦ " : ""}${card.name}${reward.kind === "xmas" && reward.boosters ? ` + ${reward.boosters} booster${reward.boosters > 1 ? "s" : ""}` : ""}`;
      await tx.adventClaim.create({ data: { userId: me.id, year: t.year, day, label, cardId: card?.id ?? null } });
      return { label, card, bonus, consolation };
    });
    await checkAchievements(me.id);
    revalidatePath("/");
    return { ok: true, day, ...result };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: "Tu as déjà ouvert la case d'aujourd'hui. Reviens demain !" };
    if (e instanceof AdventError) return { ok: false, error: e.message };
    throw e;
  }
}
