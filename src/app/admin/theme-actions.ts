"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logAdmin, requireStaff } from "@/lib/session";
import { isThemeChoice, THEMES } from "@/lib/theme";

export async function setTheme(fd: FormData) {
  const me = await requireStaff("manageTheme");
  const value = String(fd.get("theme") ?? "");
  if (!isThemeChoice(value)) return;
  await prisma.setting.upsert({ where: { key: "theme" }, create: { key: "theme", value }, update: { value } });
  await logAdmin(me, "theme.set", `a choisi le thème du site : ${THEMES[value].label}`);
  revalidatePath("/", "layout");
  redirect(`/admin?ok=${encodeURIComponent("Thème du site enregistré ✔")}#theme`);
}
