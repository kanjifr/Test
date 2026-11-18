import { prisma } from "@/lib/prisma";

/** Réglages des annonces Discord, modifiables par le propriétaire dans le panel admin. */
export type AnnounceSettings = {
  /** Rareté minimale annoncée : EPIQUE, LEGENDAIRE, MYTHIQUE ou OFF */
  pulls: "EPIQUE" | "LEGENDAIRE" | "MYTHIQUE" | "OFF";
  duels: boolean;
  trades: boolean;
  polls: boolean;
  birthdays: boolean;
};

export const DEFAULT_ANNOUNCE: AnnounceSettings = { pulls: "LEGENDAIRE", duels: true, trades: true, polls: true, birthdays: true };

export async function getAnnounceSettings(): Promise<AnnounceSettings> {
  const row = await prisma.setting.findUnique({ where: { key: "announce" } });
  if (!row) return DEFAULT_ANNOUNCE;
  try {
    return { ...DEFAULT_ANNOUNCE, ...JSON.parse(row.value) };
  } catch {
    return DEFAULT_ANNOUNCE;
  }
}

export async function setAnnounceSettings(s: AnnounceSettings) {
  const value = JSON.stringify(s);
  await prisma.setting.upsert({ where: { key: "announce" }, create: { key: "announce", value }, update: { value } });
}
