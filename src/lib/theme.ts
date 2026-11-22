import { prisma } from "@/lib/prisma";

export const THEMES = {
  auto: { label: "Automatique (Noël en décembre, Halloween fin octobre)" },
  anime: { label: "Crépuscule (thème habituel)" },
  noel: { label: "Noël ❄️" },
  halloween: { label: "Halloween 🎃" },
} as const;
export type ThemeChoice = keyof typeof THEMES;
export type SiteTheme = Exclude<ThemeChoice, "auto">;

export const isThemeChoice = (v: string): v is ThemeChoice => v in THEMES;

/** Thème du calendrier (heure de Paris) : Noël du 1er décembre au 6 janvier, Halloween du 20 au 31 octobre. */
export function seasonalTheme(now = new Date()): SiteTheme {
  const [m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number);
  if (m === 12 || (m === 1 && d <= 6)) return "noel";
  if (m === 10 && d >= 20) return "halloween";
  return "anime";
}

export async function getThemeChoice(): Promise<ThemeChoice> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: "theme" } });
    return row && isThemeChoice(row.value) ? row.value : "auto";
  } catch {
    return "auto";
  }
}

export async function getSiteTheme(): Promise<SiteTheme> {
  const c = await getThemeChoice();
  return c === "auto" ? seasonalTheme() : c;
}
