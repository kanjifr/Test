import type { Prisma } from "@prisma/client";

/** Une carte d'événement en cours sort ×EVENT_BOOST plus souvent que les autres cartes de sa rareté. */
export const EVENT_BOOST = 3;
/** Une carte alternative sort moins souvent que les autres cartes de sa rareté. */
export const ALT_WEIGHT = 0.4;

type Window = { availableFrom: Date | null; availableUntil: Date | null };

/** La carte peut-elle sortir d'un booster à cette date (fenêtre d'événement) ? */
export const inWindow = (c: Window, now = new Date()) =>
  (!c.availableFrom || c.availableFrom <= now) && (!c.availableUntil || c.availableUntil >= now);

/** Carte d'événement dont la période est terminée : on ne peut plus l'obtenir que par échange. */
export const eventOver = (c: Window & { eventName: string | null }, now = new Date()) =>
  !!c.eventName && !!c.availableUntil && c.availableUntil < now;

/**
 * Cartes qui peuvent sortir d'un booster maintenant : celles des séries ouvertes aux boosters,
 * plus les cartes d'événement pendant leurs dates (quelle que soit leur série).
 */
export function boosterWhere(now = new Date()): Prisma.CardWhereInput {
  return {
    active: true,
    // Les cartes exclusives (calendrier de l'Avent…) ne sortent jamais des boosters
    exclusive: false,
    OR: [
      { seriesId: null },
      { series: { inBoosters: true } },
      { eventName: { not: null }, NOT: { availableFrom: null, availableUntil: null } },
    ],
    AND: [
      { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
      { OR: [{ availableUntil: null }, { availableUntil: { gte: now } }] },
    ],
  };
}

/** Poids d'une carte à l'intérieur de sa rareté (événement en cours, version alternative). */
export function seriesWeight(c: Window & { eventName: string | null; variantOfId: string | null }, now = new Date()) {
  let w = 1;
  if (c.eventName && (c.availableFrom || c.availableUntil) && inWindow(c, now)) w *= EVENT_BOOST;
  if (c.variantOfId) w *= ALT_WEIGHT;
  return w;
}

/** Début (00:00) ou fin (23:59:59) d'une journée « AAAA-MM-JJ » à l'heure de Paris. */
export function parisDay(day: string, end: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const utc = new Date(`${day}T${end ? "23:59:59" : "00:00:00"}Z`);
  if (Number.isNaN(utc.getTime())) return null;
  const paris = new Date(utc.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const asUtc = new Date(utc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(utc.getTime() - (paris.getTime() - asUtc.getTime()));
}

/** Date au format « AAAA-MM-JJ » (heure de Paris), pour pré-remplir un champ date. */
export const toParisDay = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d) : "";

export const frDate = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
