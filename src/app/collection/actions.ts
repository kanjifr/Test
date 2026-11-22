"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { takeCopies } from "@/lib/copies";
import { levelCost, MAX_LEVEL } from "@/lib/evolution";
import { checkAchievements } from "@/lib/achievements-server";
import { recordProgress } from "@/lib/quests";

export type EvolveResult = { ok: true; level: number; count: number } | { ok: false; error: string };

class EvolveError extends Error {}

/** Fusionne des doublons (normaux, jamais les brillants) pour faire monter une carte d'un niveau. */
export async function evolveCard(cardId: string): Promise<EvolveResult> {
  const me = await requireUser();
  const id = String(cardId ?? "");
  try {
    const row = await prisma.$transaction(async (tx) => {
      const uc = await tx.userCard.findUnique({ where: { userId_cardId: { userId: me.id, cardId: id } } });
      if (!uc) throw new EvolveError("Tu ne possèdes pas cette carte.");
      if (uc.level >= MAX_LEVEL) throw new EvolveError("Cette carte est déjà au niveau maximum.");
      const cost = levelCost(uc.level);
      // Retrait atomique ; on garde toujours au moins un exemplaire
      const done = await takeCopies(tx, me.id, id, cost, false, true);
      if (!done) throw new EvolveError(`Il te faut ${cost} doublon${cost > 1 ? "s" : ""} normal${cost > 1 ? "aux" : ""} de cette carte (les brillantes ne sont jamais fusionnées).`);
      // Le niveau ne monte que s'il n'a pas changé entre-temps (double clic)
      const up = await tx.userCard.updateMany({ where: { userId: me.id, cardId: id, level: uc.level }, data: { level: { increment: 1 } } });
      if (up.count === 0) throw new EvolveError("La carte vient déjà d'évoluer. Recharge la page.");
      return tx.userCard.findUniqueOrThrow({ where: { userId_cardId: { userId: me.id, cardId: id } } });
    });
    await recordProgress(me.id, "evolutions", 1);
    await checkAchievements(me.id);
    revalidatePath("/collection");
    revalidatePath("/duels");
    return { ok: true, level: row.level, count: row.count };
  } catch (e) {
    if (e instanceof EvolveError) return { ok: false, error: e.message };
    throw e;
  }
}
