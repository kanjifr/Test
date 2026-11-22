"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logAdmin, requireStaff } from "@/lib/session";
import { announceSeries } from "@/lib/announce";

const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);

export async function createSeries(fd: FormData) {
  const me = await requireStaff("manageSeries");
  const name = str(fd, "name", 40);
  if (!name) redirect(`/admin/series?err=${encodeURIComponent("Donne un nom à la série.")}`);
  const s = await prisma.series.create({
    data: { name, description: str(fd, "description", 200), inBoosters: fd.get("inBoosters") === "on" },
  });
  await logAdmin(me, "series.create", `a créé la série « ${s.name} »`);
  revalidatePath("/", "layout");
  redirect(`/admin/series?ok=${encodeURIComponent(`Série « ${s.name} » créée ✔`)}`);
}

export async function updateSeries(fd: FormData) {
  const me = await requireStaff("manageSeries");
  const id = str(fd, "id", 64);
  const name = str(fd, "name", 40);
  const before = await prisma.series.findUnique({ where: { id } });
  if (!before || !name) return;
  const inBoosters = fd.get("inBoosters") === "on";
  await prisma.series.update({ where: { id }, data: { name, description: str(fd, "description", 200), inBoosters } });
  const changes = [
    before.name !== name && `renommée en « ${name} »`,
    before.inBoosters !== inBoosters && (inBoosters ? "ajoutée aux boosters" : "retirée des boosters"),
  ].filter(Boolean);
  if (changes.length) await logAdmin(me, "series.update", `série « ${before.name} » : ${changes.join(", ")}`);
  // Annonce Discord quand une nouvelle série arrive dans les boosters
  if (!before.inBoosters && inBoosters && fd.get("announce") === "on") {
    const count = await prisma.card.count({ where: { seriesId: id, active: true } });
    await announceSeries(name, count).catch(() => {});
  }
  revalidatePath("/", "layout");
}

export async function deleteSeries(fd: FormData) {
  const me = await requireStaff("manageSeries");
  const id = str(fd, "id", 64);
  const s = await prisma.series.findUnique({ where: { id }, include: { _count: { select: { cards: true } } } });
  if (!s) return;
  // Les cartes ne sont pas supprimées : elles deviennent « hors série »
  await prisma.series.delete({ where: { id } });
  await logAdmin(me, "series.delete", `a supprimé la série « ${s.name} » (${s._count.cards} carte(s) passée(s) hors série)`);
  revalidatePath("/", "layout");
}
