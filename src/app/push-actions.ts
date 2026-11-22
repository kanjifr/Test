"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { notifyUser, PUSH_KINDS, type PushKind } from "@/lib/push";

type Sub = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

export async function savePushSubscription(sub: Sub): Promise<{ ok: boolean }> {
  const me = await requireUser();
  const endpoint = String(sub?.endpoint ?? "");
  const p256dh = String(sub?.keys?.p256dh ?? "");
  const auth = String(sub?.keys?.auth ?? "");
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) return { ok: false };
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth, userId: me.id },
    update: { p256dh, auth, userId: me.id },
  });
  // Petite notification de bienvenue pour confirmer que tout marche
  await notifyUser(me.id, "booster", { title: "🔔 Notifications activées", body: "Tu seras prévenu quand ton booster sera prêt.", url: "/profil#appli" });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const me = await requireUser();
  await prisma.pushSubscription.deleteMany({ where: { endpoint: String(endpoint ?? ""), userId: me.id } });
}

export async function setPushPrefs(fd: FormData) {
  const me = await requireUser();
  const off = (Object.keys(PUSH_KINDS) as PushKind[]).filter((k) => fd.get(k) !== "on");
  await prisma.user.update({ where: { id: me.id }, data: { pushOff: off } });
  revalidatePath("/profil");
}
