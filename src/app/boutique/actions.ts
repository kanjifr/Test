"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getShopConfig, spendCoins } from "@/lib/coins";
import { giveCopies } from "@/lib/copies";
import { weekEnd } from "@/lib/quests";
import { checkAchievements } from "@/lib/achievements-server";
import { cardPrice, shopCardWhere } from "@/lib/shop";

const back = (msg: string, ok = false) => redirect(`/boutique?${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);

export async function buyBooster() {
  const me = await requireUser();
  const shop = await getShopConfig();
  const weekStart = new Date(weekEnd().getTime() - 7 * 86400_000);
  const bought = await prisma.coinLog.count({ where: { userId: me.id, reason: "Achat : booster", createdAt: { gte: weekStart } } });
  if (bought >= shop.boostersPerWeek) back(`Tu as déjà acheté ${shop.boostersPerWeek} booster${shop.boostersPerWeek > 1 ? "s" : ""} cette semaine. Reviens lundi !`);
  const ok = await prisma.$transaction(async (tx) => {
    if (!(await spendCoins(tx, me.id, shop.booster, "Achat : booster"))) return false;
    await tx.user.update({ where: { id: me.id }, data: { bonusPacks: { increment: 1 } } });
    return true;
  });
  if (!ok) back("Pas assez de pièces.");
  revalidatePath("/", "layout");
  back("🎁 Booster acheté ! Il t'attend sur la page Booster.", true);
}

export async function buyCard(fd: FormData) {
  const me = await requireUser();
  const id = String(fd.get("cardId") ?? "");
  const [shop, card] = await Promise.all([getShopConfig(), prisma.card.findFirst({ where: { ...shopCardWhere(), id } })]);
  if (!card) back("Cette carte n'est pas en vente.");
  const price = cardPrice(card!, shop);
  const ok = await prisma.$transaction(async (tx) => {
    if (!(await spendCoins(tx, me.id, price, `Achat : ${card!.name}`))) return false;
    const owned = await giveCopies(tx, me.id, card!.id, 1, false);
    await tx.pull.create({ data: { userId: me.id, cardId: card!.id, isNew: owned.count === 1, shiny: false } });
    return true;
  });
  if (!ok) back("Pas assez de pièces.");
  await checkAchievements(me.id);
  revalidatePath("/", "layout");
  back(`🃏 ${card!.name} rejoint ta collection !`, true);
}
