/** Jour et mois du jour, à l'heure de Paris. */
export function parisToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", month: "numeric", day: "numeric" }).formatToParts(now);
  return {
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}

export function isBirthdayToday(month: number | null | undefined, day: number | null | undefined, now = new Date()) {
  if (!month || !day) return false;
  const t = parisToday(now);
  return t.month === month && t.day === day;
}

/** Une carte d'anniversaire apparaît ce nombre de fois plus souvent dans les boosters. */
export const BIRTHDAY_BOOST = 5;

export const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Vérifie qu'une date (jour/mois) existe, 29 février compris. */
export function validBirthday(month: number, day: number) {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) return false;
  return day <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
