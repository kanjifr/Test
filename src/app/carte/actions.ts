"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logAdmin, requireStaff, requireUser } from "@/lib/session";
import { can, staffRole } from "@/lib/admin";
import { checkAchievements } from "@/lib/achievements-server";

import { ANECDOTE_MAX } from "@/lib/anecdotes";
const MAX_PENDING_PER_MEMBER = 5;

const clean = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\r/g, "").trim().slice(0, ANECDOTE_MAX);

/** Un membre propose une anecdote ; celles du staff sont publiées directement. */
export async function submitAnecdote(fd: FormData) {
  const me = await requireUser();
  const cardId = String(fd.get("cardId") ?? "");
  const text = clean(fd.get("text"));
  const back = (q: string) => redirect(`/carte/${cardId}?${q}#livre-d-or`);
  if (text.length < 3) back("err=" + encodeURIComponent("Ton anecdote est un peu courte."));
  const [card, db] = await Promise.all([
    prisma.card.findFirst({ where: { id: cardId, active: true }, select: { id: true, name: true } }),
    prisma.user.findUnique({ where: { id: me.id }, select: { role: true } }),
  ]);
  if (!card) redirect("/collection");
  const staff = can(staffRole(me.discordId, db?.role), "moderateAnecdotes");
  if (!staff) {
    const pending = await prisma.anecdote.count({ where: { authorId: me.id, status: "PENDING" } });
    if (pending >= MAX_PENDING_PER_MEMBER) {
      back("err=" + encodeURIComponent(`Tu as déjà ${MAX_PENDING_PER_MEMBER} anecdotes en attente de validation. Patience !`));
    }
  }
  await prisma.anecdote.create({
    data: { cardId, authorId: me.id, text, status: staff ? "APPROVED" : "PENDING", reviewedById: staff ? me.id : null },
  });
  if (staff) await checkAchievements(me.id);
  revalidatePath(`/carte/${cardId}`);
  revalidatePath("/admin");
  back(staff ? "ok=publiee" : "ok=attente");
}

export async function approveAnecdote(fd: FormData) {
  const me = await requireStaff("moderateAnecdotes");
  const id = String(fd.get("id") ?? "");
  const text = clean(fd.get("text"));
  const a = await prisma.anecdote.update({
    where: { id },
    data: { status: "APPROVED", reviewedById: me.id, ...(text.length >= 3 ? { text } : {}) },
    include: { card: { select: { name: true } }, author: { select: { name: true } } },
  });
  await logAdmin(me, "anecdote.approve", `a validé une anecdote de ${a.author?.name ?? "?"} sur la carte ${a.card.name}`);
  if (a.authorId) await checkAchievements(a.authorId);
  revalidatePath(`/carte/${a.cardId}`);
  revalidatePath("/admin");
}

export async function editAnecdote(fd: FormData) {
  const me = await requireStaff("moderateAnecdotes");
  const id = String(fd.get("id") ?? "");
  const text = clean(fd.get("text"));
  if (text.length < 3) return;
  const a = await prisma.anecdote.update({ where: { id }, data: { text }, include: { card: { select: { name: true } } } });
  await logAdmin(me, "anecdote.edit", `a modifié une anecdote sur la carte ${a.card.name}`);
  revalidatePath(`/carte/${a.cardId}`);
  revalidatePath("/admin");
}

export async function deleteAnecdote(fd: FormData) {
  const me = await requireStaff("moderateAnecdotes");
  const id = String(fd.get("id") ?? "");
  const a = await prisma.anecdote.delete({ where: { id }, include: { card: { select: { name: true } }, author: { select: { name: true } } } });
  await logAdmin(me, "anecdote.delete", `a supprimé une anecdote de ${a.author?.name ?? "?"} sur la carte ${a.card.name}`);
  revalidatePath(`/carte/${a.cardId}`);
  revalidatePath("/admin");
}
