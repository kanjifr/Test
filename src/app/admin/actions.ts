"use server";

import type { Element, Rarity } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { ELEMENT_KEYS, RARITY_ORDER } from "@/lib/game";
import { deleteUpload, saveUpload } from "@/lib/uploads";
import { DEMO_CARDS } from "@/lib/demo";
import { checkAchievements } from "@/lib/achievements-server";

function str(fd: FormData, k: string, max: number) {
  return String(fd.get(k) ?? "").trim().slice(0, max);
}
function stat(fd: FormData, k: string) {
  const n = Number.parseInt(String(fd.get(k) ?? ""), 10);
  return Number.isNaN(n) ? 50 : Math.min(999, Math.max(0, n));
}

export async function saveCard(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id", 64) || null;
  const name = str(fd, "name", 40);
  const rarity = str(fd, "rarity", 20) as Rarity;
  const element = str(fd, "element", 20) as Element;
  if (!name) redirect(`/admin?err=${encodeURIComponent("Le nom est obligatoire.")}`);
  if (!RARITY_ORDER.includes(rarity) || !ELEMENT_KEYS.includes(element)) {
    redirect(`/admin?err=${encodeURIComponent("Rareté ou élément invalide.")}`);
  }

  const subjectId = str(fd, "subjectId", 64) || null;
  if (subjectId) {
    const s = await prisma.user.findUnique({ where: { id: subjectId }, select: { consent: true } });
    if (!s?.consent) redirect(`/admin?err=${encodeURIComponent("Ce membre n'a pas donné son accord.")}`);
  }

  const existing = id ? await prisma.card.findUnique({ where: { id } }) : null;
  let imageUrl = existing?.imageUrl ?? null;

  const file = fd.get("image");
  const urlInput = str(fd, "imageUrl", 500);
  try {
    if (file instanceof File && file.size > 0) {
      const saved = await saveUpload(file);
      await deleteUpload(imageUrl);
      imageUrl = saved;
    } else if (fd.get("removeImage") === "on") {
      await deleteUpload(imageUrl);
      imageUrl = null;
    } else if (urlInput && urlInput !== imageUrl) {
      if (!/^https:\/\//.test(urlInput)) throw new Error("L'URL de l'image doit commencer par https://");
      await deleteUpload(imageUrl);
      imageUrl = urlInput;
    }
  } catch (e) {
    redirect(`/admin?err=${encodeURIComponent((e as Error).message)}${id ? `&edit=${id}` : ""}`);
  }

  const data = {
    name,
    title: str(fd, "title", 40),
    description: str(fd, "description", 300),
    rarity,
    element,
    attack: stat(fd, "attack"),
    defense: stat(fd, "defense"),
    subjectId,
    imageUrl,
  };
  if (existing) await prisma.card.update({ where: { id: existing.id }, data });
  else await prisma.card.create({ data });
  if (subjectId) await checkAchievements(subjectId);

  revalidatePath("/", "layout");
  redirect("/admin?ok=1");
}

export async function toggleCard(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id", 64);
  const card = await prisma.card.findUnique({ where: { id } });
  if (card) await prisma.card.update({ where: { id }, data: { active: !card.active } });
  revalidatePath("/", "layout");
}

export async function deleteCard(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id", 64);
  const card = await prisma.card.findUnique({ where: { id } });
  if (!card) return;
  await prisma.card.delete({ where: { id } });
  await deleteUpload(card.imageUrl);
  revalidatePath("/", "layout");
}

export async function seedDemo() {
  await requireAdmin();
  if ((await prisma.card.count()) === 0) {
    await prisma.card.createMany({ data: DEMO_CARDS });
  }
  revalidatePath("/", "layout");
}

export async function resetCooldown(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "userId", 64);
  await prisma.user.update({ where: { id }, data: { lastPackAt: null } });
  revalidatePath("/admin");
}
