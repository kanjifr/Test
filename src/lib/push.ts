import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { SITE_NAME } from "@/lib/game";

/** Types de notifications, que chaque membre peut désactiver dans son profil. */
export const PUSH_KINDS = {
  booster: "Mon booster est prêt",
  trade: "On me propose un échange",
  advent: "Nouvelle case du calendrier de l'Avent",
  tournament: "Tournois (ouverture et résultats)",
} as const;
export type PushKind = keyof typeof PUSH_KINDS;

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

let ready: Promise<string> | null = null;

/**
 * Clés VAPID : celles des variables d'environnement si présentes, sinon créées une fois
 * et gardées en base (aucune configuration nécessaire).
 */
export function vapidPublicKey(): Promise<string> {
  ready ??= (async () => {
    let pub = process.env.VAPID_PUBLIC_KEY;
    let priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
      const row = await prisma.setting.findUnique({ where: { key: "vapid" } });
      if (row) ({ pub, priv } = JSON.parse(row.value));
      else {
        const k = webpush.generateVAPIDKeys();
        pub = k.publicKey;
        priv = k.privateKey;
        // Si une autre instance a créé les clés en même temps, on garde les siennes
        await prisma.setting.create({ data: { key: "vapid", value: JSON.stringify({ pub, priv }) } }).catch(async () => {
          const again = await prisma.setting.findUniqueOrThrow({ where: { key: "vapid" } });
          ({ pub, priv } = JSON.parse(again.value));
        });
      }
    }
    const subject = process.env.VAPID_SUBJECT || (process.env.AUTH_URL?.startsWith("https://") ? process.env.AUTH_URL : "https://example.invalid");
    webpush.setVapidDetails(subject!, pub!, priv!);
    return pub!;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

async function send(subs: { id: string; endpoint: string; p256dh: string; auth: string }[], msg: PushMessage) {
  if (subs.length === 0) return;
  await vapidPublicKey();
  const payload = JSON.stringify({ ...msg, title: msg.title || SITE_NAME });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600 });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // Abonnement expiré ou retiré par le membre : on l'oublie
        if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else console.error("[notification]", code ?? (e as Error).message);
      }
    }),
  );
}

/** Notifie un membre (sauf s'il a désactivé ce type). Ne lève jamais d'erreur. */
export async function notifyUser(userId: string, kind: PushKind, msg: PushMessage) {
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId, user: { NOT: { pushOff: { has: kind } } } } });
    await send(subs, msg);
  } catch (e) {
    console.error("[notification]", (e as Error).message);
  }
}

export async function notifyAll(kind: PushKind, msg: PushMessage) {
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { user: { NOT: { pushOff: { has: kind } } } } });
    await send(subs, msg);
  } catch (e) {
    console.error("[notification]", (e as Error).message);
  }
}
