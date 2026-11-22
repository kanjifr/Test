"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logAdmin, requireStaff } from "@/lib/session";
import { START_RATING } from "@/lib/elo";

/** Remet à zéro les victoires, défaites et cotes de tout le monde (et la saison en cours). */
export async function resetDuels(fd: FormData) {
  const me = await requireStaff("manageDuels");
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "REMETTRE A ZERO") {
    redirect(`/admin/duels?err=${encodeURIComponent("Écris REMETTRE A ZERO pour confirmer.")}`);
  }
  const deleteHistory = fd.get("history") === "on";
  const now = new Date();
  const [users, deleted] = await prisma.$transaction(async (tx) => {
    const u = await tx.user.updateMany({ data: { duelWins: 0, duelLosses: 0, duelRating: START_RATING, duelPeak: START_RATING } });
    // Les matchs de tournoi restent (ils sont liés aux tableaux des tournois)
    const d = deleteHistory ? await tx.duel.deleteMany({ where: { tournamentId: null } }) : { count: 0 };
    await tx.setting.upsert({ where: { key: "duels:resetAt" }, create: { key: "duels:resetAt", value: now.toISOString() }, update: { value: now.toISOString() } });
    return [u.count, d.count];
  });
  await logAdmin(
    me,
    "duels.reset",
    `a remis à zéro les duels (${users} membres : victoires, défaites et cotes à ${START_RATING})${deleteHistory ? `, et supprimé ${deleted} combats de l'historique` : ""}`,
  );
  revalidatePath("/", "layout");
  redirect(`/admin/duels?ok=${encodeURIComponent("Duels remis à zéro ✔")}`);
}
