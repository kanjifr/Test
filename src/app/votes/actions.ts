"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { checkAchievements } from "@/lib/achievements-server";

export async function castVote(fd: FormData) {
  const me = await requireUser();
  const pollId = String(fd.get("pollId") ?? "");
  const optionId = String(fd.get("optionId") ?? "");
  const option = await prisma.pollOption.findFirst({
    where: { id: optionId, pollId, poll: { closesAt: { gt: new Date() } } },
    select: { id: true },
  });
  if (!option) return; // vote terminé ou option inconnue
  await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId, userId: me.id } },
    create: { pollId, userId: me.id, optionId },
    update: { optionId, createdAt: new Date() },
  });
  await checkAchievements(me.id);
  revalidatePath("/", "layout");
}
