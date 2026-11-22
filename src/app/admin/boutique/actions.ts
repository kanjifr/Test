"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logAdmin, requireStaff } from "@/lib/session";
import { addCoins, DEFAULT_SHOP, sanitizeShop, setShopConfig } from "@/lib/coins";

const num = (fd: FormData, k: string) => Number(fd.get(k));

export async function saveShop(fd: FormData) {
  const me = await requireStaff("manageShop");
  if (fd.get("reset") === "1") await setShopConfig(DEFAULT_SHOP);
  else
    await setShopConfig(
      sanitizeShop({
        booster: num(fd, "booster"),
        boostersPerWeek: num(fd, "boostersPerWeek"),
        prices: { COMMUNE: num(fd, "COMMUNE"), RARE: num(fd, "RARE"), EPIQUE: num(fd, "EPIQUE"), LEGENDAIRE: num(fd, "LEGENDAIRE") },
        duelWin: num(fd, "duelWin"),
        duelLoss: num(fd, "duelLoss"),
        quest: num(fd, "quest"),
        tournamentPlay: num(fd, "tournamentPlay"),
        tournamentFinal: num(fd, "tournamentFinal"),
        tournamentWin: num(fd, "tournamentWin"),
        season: [num(fd, "season0"), num(fd, "season1"), num(fd, "season2")],
      }),
    );
  await logAdmin(me, "shop.save", "a modifié les prix et les gains de la boutique");
  revalidatePath("/", "layout");
  redirect("/admin/boutique?ok=1");
}

export async function giftCoins(fd: FormData) {
  const me = await requireStaff("manageShop");
  const userId = String(fd.get("userId") ?? "");
  const amount = Math.max(-100_000, Math.min(100_000, Math.floor(Number(fd.get("amount"))) || 0));
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, coins: true } });
  if (!target || !amount) redirect("/admin/boutique");
  // On ne descend jamais sous 0
  const real = Math.max(amount, -target!.coins);
  await addCoins(prisma, userId, real, real > 0 ? "Cadeau du staff" : "Retrait par le staff");
  await logAdmin(me, "coins.gift", `${real > 0 ? "a offert" : "a retiré"} ${Math.abs(real)} pièces ${real > 0 ? "à" : "à"} ${target!.name}`);
  revalidatePath("/", "layout");
  redirect("/admin/boutique?ok=2");
}
