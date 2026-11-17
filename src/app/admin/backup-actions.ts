"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAdmin, requireStaff } from "@/lib/session";
import { readBackup, restoreBackup, saveLocalCopy, sendBackupToDiscord } from "@/lib/backup";

const back = (key: "err" | "ok", msg: string) => redirect(`/admin?${key}=${encodeURIComponent(msg)}#sauvegardes`);

export async function sendBackupNow() {
  const me = await requireStaff("manageBackups");
  try {
    await sendBackupToDiscord("manual");
  } catch (e) {
    back("err", (e as Error).message);
  }
  await logAdmin(me, "backup.manual", "a envoyé une sauvegarde sur Discord");
  revalidatePath("/admin");
  back("ok", "Sauvegarde envoyée sur Discord ✔");
}

export async function restoreFromBackup(fd: FormData) {
  const me = await requireStaff("manageBackups");
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "RESTAURER") {
    back("err", "Écris RESTAURER pour confirmer la restauration.");
  }
  const file = fd.get("backup");
  if (!(file instanceof File) || file.size === 0) back("err", "Choisis un fichier de sauvegarde.");
  let summary = "";
  try {
    const backup = readBackup(Buffer.from(await (file as File).arrayBuffer()));
    // Filet de sécurité : l'état actuel est copié sur le disque avant d'être remplacé
    await saveLocalCopy("avant-restauration");
    await restoreBackup(backup);
    summary = `sauvegarde du ${new Date(backup.createdAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} (${backup.counts.users} membres, ${backup.counts.cards} cartes)`;
  } catch (e) {
    back("err", `Restauration impossible, rien n'a été modifié : ${(e as Error).message}`);
  }
  await logAdmin(me, "backup.restore", `a restauré la ${summary}`);
  revalidatePath("/", "layout");
  back("ok", `Restauration terminée : ${summary}.`);
}
