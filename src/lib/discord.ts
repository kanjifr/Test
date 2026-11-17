/** Adresse d'un webhook Discord (https://discord.com/api/webhooks/<id>/<jeton>). */
export const WEBHOOK_RE = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export const isWebhook = (url: string | undefined | null) => WEBHOOK_RE.test(url ?? "");

/** Mention affichée comme @pseudo, sans notifier la personne (voir allowed_mentions). */
export const mention = (u: { discordId?: string | null; name?: string | null }) =>
  u.discordId && /^\d{5,25}$/.test(u.discordId) ? `<@${u.discordId}>` : `**${u.name ?? "Un membre"}**`;

/** Adresse publique du site, pour les liens et les images dans Discord. */
export function siteUrl(path = "") {
  const base = (process.env.AUTH_URL ?? "").replace(/\/+$/, "");
  return base ? `${base}${path}` : "";
}

/** Rend absolue une image servie par le site ; ignore ce que Discord ne pourrait pas charger. */
export function publicImage(url: string | null | undefined) {
  if (!url) return undefined;
  if (/^https:\/\//.test(url)) return url;
  if (url.startsWith("/") && siteUrl()) return siteUrl(url);
  return undefined;
}
