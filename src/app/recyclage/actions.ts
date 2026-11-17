"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { RECYCLE_COST } from "@/lib/game";
import { checkAchievements } from "@/lib/achievements-server";

export type RecycleResult = { ok: true; boosters: number; bonus: number } | { ok: false; error: string };

class RecycleError extends Error {}

/** Recycle des doublons (on garde toujours au moins un exemplaire) contre des boosters bonus. */
export async function recycleDuplicates(lines: { cardId: string; qty: number }[]): Promise<RecycleResult> {
  const me = await requireUser();
  const map = new Map<string, number>();
  for (const l of Array.isArray(lines) ? lines.slice(0, 500) : []) {
    const qty = Math.floor(Number(l?.qty));
    const id = String(l?.cardId ?? "");
    if (!id || !Number.isFinite(qty) || qty < 1 || qty > 1000) return { ok: false, error: "Sélection invalide." };
    map.set(id, (map.get(id) ?? 0) + qty);
  }
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  if (total === 0 || total % RECYCLE_COST !== 0) {
    return { ok: false, error: `Choisis un multiple de ${RECYCLE_COST} doublons (tu en as sélectionné ${total}).` };
  }
  const boosters = total / RECYCLE_COST;
  try {
    const user = await prisma.$transaction(async (tx) => {
      for (const [cardId, qty] of map) {
        // Retrait atomique : impossible de descendre sous un exemplaire
        const done = await tx.userCard.updateMany({
          where: { userId: me.id, cardId, count: { gte: qty + 1 } },
          data: { count: { decrement: qty } },
        });
        if (done.count === 0) throw new RecycleError("Tu n'as plus assez de doublons de l'une des cartes. Recharge la page.");
      }
      return tx.user.update({
        where: { id: me.id },
        data: { bonusPacks: { increment: boosters }, recycledCount: { increment: total } },
        select: { bonusPacks: true },
      });
    });
    await checkAchievements(me.id);
    revalidatePath("/", "layout");
    return { ok: true, boosters, bonus: user.bonusPacks };
  } catch (e) {
    if (e instanceof RecycleError) return { ok: false, error: e.message };
    throw e;
  }
}
