"use server";

import type { Element, Rarity, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logAdmin, requireStaff } from "@/lib/session";
import { isOwnerDiscordId, ROLE_LABELS } from "@/lib/admin";
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
  const me = await requireStaff("editCards");
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
  if (existing) {
    const c = await prisma.card.update({ where: { id: existing.id }, data });
    await logAdmin(me, "card.update", `a modifié la carte #${c.number} ${c.name}`);
  } else {
    const c = await prisma.card.create({ data });
    await logAdmin(me, "card.create", `a créé la carte #${c.number} ${c.name} (${c.rarity.toLowerCase()})`);
  }
  if (subjectId) await checkAchievements(subjectId);

  revalidatePath("/", "layout");
  redirect("/admin?ok=1");
}

export async function toggleCard(fd: FormData) {
  const me = await requireStaff("toggleCards");
  const id = str(fd, "id", 64);
  const card = await prisma.card.findUnique({ where: { id } });
  if (card) {
    await prisma.card.update({ where: { id }, data: { active: !card.active } });
    await logAdmin(me, "card.toggle", `a ${card.active ? "désactivé" : "réactivé"} la carte #${card.number} ${card.name}`);
  }
  revalidatePath("/", "layout");
}

export async function deleteCard(fd: FormData) {
  const me = await requireStaff("deleteCards");
  const id = str(fd, "id", 64);
  const card = await prisma.card.findUnique({ where: { id }, include: { _count: { select: { owners: true } } } });
  if (!card) return;
  await prisma.card.delete({ where: { id } });
  await deleteUpload(card.imageUrl);
  await logAdmin(me, "card.delete", `a supprimé la carte #${card.number} ${card.name} (possédée par ${card._count.owners} membre(s))`);
  revalidatePath("/", "layout");
}

export async function seedDemo() {
  const me = await requireStaff("seedDemo");
  if ((await prisma.card.count()) === 0) {
    await prisma.card.createMany({ data: DEMO_CARDS });
    await logAdmin(me, "card.seed", `a créé les ${DEMO_CARDS.length} cartes de démo`);
  }
  revalidatePath("/", "layout");
}

export async function resetCooldown(fd: FormData) {
  const me = await requireStaff("giftBoosters");
  const id = str(fd, "userId", 64);
  const u = await prisma.user.update({ where: { id }, data: { lastPackAt: null } });
  await logAdmin(me, "booster.gift", `a offert un booster à ${u.name}`);
  revalidatePath("/admin");
}

const ROLES: Role[] = ["MEMBER", "MODERATOR", "ADMIN"];

export async function setRole(fd: FormData) {
  const me = await requireStaff("manageRoles");
  const id = str(fd, "userId", 64);
  const role = str(fd, "role", 20) as Role;
  if (!ROLES.includes(role)) return;
  const target = await prisma.user.findUnique({ where: { id } });
  // Les propriétaires sont définis dans la configuration, pas depuis le site
  if (!target || target.id === me.id || isOwnerDiscordId(target.discordId) || target.role === role) return;
  await prisma.user.update({ where: { id }, data: { role } });
  await logAdmin(me, "role.set", `a changé le rôle de ${target.name} : ${ROLE_LABELS[target.role]} → ${ROLE_LABELS[role]}`);
  revalidatePath("/", "layout");
}

export async function resetCollection(fd: FormData) {
  const me = await requireStaff("resetCollections");
  const id = str(fd, "userId", 64);
  const withAchievements = fd.get("achievements") === "on";
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return;
  // Seul un propriétaire peut réinitialiser un autre propriétaire
  if (isOwnerDiscordId(target.discordId) && me.role !== "OWNER") return;

  const [removed] = await prisma.$transaction([
    prisma.userCard.deleteMany({ where: { userId: id } }),
    // Les échanges en attente ne sont plus réalisables
    prisma.trade.updateMany({
      where: { status: "PENDING", OR: [{ fromId: id }, { toId: id }] },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    }),
    ...(withAchievements
      ? [
          prisma.userAchievement.deleteMany({ where: { userId: id } }),
          prisma.user.update({ where: { id }, data: { featuredBadge: null, packsOpened: 0 } }),
        ]
      : []),
  ]);
  await logAdmin(
    me,
    "collection.reset",
    `a réinitialisé la collection de ${target.name} (${removed.count} carte(s) différente(s))${withAchievements ? ", ainsi que ses succès" : ""}`,
  );
  revalidatePath("/", "layout");
}
