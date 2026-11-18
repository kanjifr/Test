"use server";

import type { Rarity } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logAdmin, requireStaff } from "@/lib/session";
import { RARITY_ORDER } from "@/lib/game";
import { POLL_MAX_DAYS, announceNewPoll, finalizePolls } from "@/lib/polls";

const back = (key: "err" | "ok", msg: string) => redirect(`/admin?${key}=${encodeURIComponent(msg)}#votes`);

export async function createPoll(fd: FormData) {
  const me = await requireStaff("managePolls");
  const question = String(fd.get("question") ?? "").trim().slice(0, 140);
  const kind = fd.get("kind") === "TEXT" ? "TEXT" : "MEMBERS";
  const days = Math.min(POLL_MAX_DAYS, Math.max(1, Math.floor(Number(fd.get("days")) || 3)));
  const rarityRaw = String(fd.get("rarity") ?? "");
  const rarity = RARITY_ORDER.includes(rarityRaw as Rarity) ? (rarityRaw as Rarity) : null;
  if (!question) back("err", "Écris la question du vote.");

  let options: { label: string; subjectId: string | null }[] = [];
  if (kind === "MEMBERS") {
    const ids = fd.getAll("members").map(String);
    const members = await prisma.user.findMany({ where: { id: { in: ids }, consent: true }, select: { id: true, name: true } });
    options = members.map((m) => ({ label: m.name ?? "?", subjectId: m.id }));
  } else {
    const lines = String(fd.get("texts") ?? "").split("\n").map((l) => l.trim().slice(0, 80)).filter(Boolean);
    options = [...new Set(lines)].map((label) => ({ label, subjectId: null }));
  }
  if (options.length < 2) back("err", "Il faut au moins 2 choix pour un vote.");
  if (options.length > 40) back("err", "40 choix maximum.");

  const closesAt = new Date(Date.now() + days * 24 * 3600_000);
  await prisma.poll.create({ data: { question, kind, rarity, closesAt, options: { create: options } } });
  await logAdmin(me, "poll.create", `a lancé le vote « ${question} » (${options.length} choix, ${days} jour(s))`);
  await announceNewPoll(question, closesAt);
  revalidatePath("/", "layout");
  back("ok", "Vote lancé ✔");
}

export async function closePoll(fd: FormData) {
  const me = await requireStaff("managePolls");
  const id = String(fd.get("id") ?? "");
  const p = await prisma.poll.update({ where: { id }, data: { closesAt: new Date() } });
  await logAdmin(me, "poll.close", `a terminé le vote « ${p.question} »`);
  await finalizePolls();
  revalidatePath("/", "layout");
}

export async function deletePoll(fd: FormData) {
  const me = await requireStaff("managePolls");
  const id = String(fd.get("id") ?? "");
  const p = await prisma.poll.delete({ where: { id } });
  await logAdmin(me, "poll.delete", `a supprimé le vote « ${p.question} »`);
  revalidatePath("/", "layout");
}
