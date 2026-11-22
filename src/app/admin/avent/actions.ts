"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAdmin, requireStaff } from "@/lib/session";
import { DEFAULT_ADVENT, sanitizeReward, setAdventConfig } from "@/lib/advent";

export async function saveAdvent(fd: FormData) {
  const me = await requireStaff("manageAdvent");
  if (fd.get("reset") === "1") {
    await setAdventConfig(DEFAULT_ADVENT);
  } else {
    const days = DEFAULT_ADVENT.days.map((d, i) =>
      sanitizeReward(
        { kind: fd.get(`kind${i}`), n: fd.get(`n${i}`), boosters: fd.get(`n${i}`), rarity: fd.get(`rarity${i}`) || null },
        d,
      ),
    );
    const eventName = String(fd.get("eventName") ?? "").trim().slice(0, 30) || DEFAULT_ADVENT.eventName;
    const grandMin = Math.min(24, Math.max(1, Math.floor(Number(fd.get("grandMin"))) || DEFAULT_ADVENT.grandMin));
    await setAdventConfig({ eventName, grandMin, days });
  }
  await logAdmin(me, "advent.save", "a modifié le calendrier de l'Avent");
  revalidatePath("/", "layout");
  redirect("/admin/avent?ok=1");
}
