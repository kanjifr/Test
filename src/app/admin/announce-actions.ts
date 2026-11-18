"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAdmin, requireStaff } from "@/lib/session";
import { setAnnounceSettings, type AnnounceSettings } from "@/lib/settings";
import { postAnnouncement } from "@/lib/announce";
import { SITE_NAME } from "@/lib/game";
import { mention, siteUrl } from "@/lib/discord";

const back = (key: "err" | "ok", msg: string) => redirect(`/admin?${key}=${encodeURIComponent(msg)}#annonces`);
const PULLS: AnnounceSettings["pulls"][] = ["EPIQUE", "LEGENDAIRE", "MYTHIQUE", "OFF"];

export async function saveAnnounceSettings(fd: FormData) {
  const me = await requireStaff("manageAnnouncements");
  const pulls = String(fd.get("pulls")) as AnnounceSettings["pulls"];
  const settings: AnnounceSettings = {
    pulls: PULLS.includes(pulls) ? pulls : "LEGENDAIRE",
    duels: fd.get("duels") === "on",
    trades: fd.get("trades") === "on",
    polls: fd.get("polls") === "on",
    birthdays: fd.get("birthdays") === "on",
  };
  await setAnnounceSettings(settings);
  await logAdmin(me, "announce.settings", `a modifié les annonces Discord (tirages : ${settings.pulls.toLowerCase()}, duels : ${settings.duels ? "oui" : "non"}, échanges : ${settings.trades ? "oui" : "non"}, votes : ${settings.polls ? "oui" : "non"}, anniversaires : ${settings.birthdays ? "oui" : "non"})`);
  revalidatePath("/admin");
  back("ok", "Réglages des annonces enregistrés ✔");
}

export async function sendTestAnnouncement() {
  const me = await requireStaff("manageAnnouncements");
  try {
    await postAnnouncement({
      content: `👋 Test des annonces de **${SITE_NAME}**, envoyé par ${mention(me)}. Les grands tirages, duels et échanges apparaîtront ici !${siteUrl() ? ` ${siteUrl()}` : ""}`,
    });
  } catch (e) {
    back("err", (e as Error).message);
  }
  back("ok", "Message de test envoyé sur Discord ✔");
}
