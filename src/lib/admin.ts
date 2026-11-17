import type { Role } from "@prisma/client";

export type StaffRole = "OWNER" | "ADMIN" | "MODERATOR";

export const ROLE_LABELS: Record<StaffRole | "MEMBER", string> = {
  OWNER: "Propriétaire",
  ADMIN: "Admin",
  MODERATOR: "Modérateur",
  MEMBER: "Membre",
};

/** Propriétaires : IDs Discord dans OWNER_DISCORD_IDS (ou l'ancien ADMIN_DISCORD_IDS). */
export function isOwnerDiscordId(discordId?: string | null): boolean {
  if (!discordId) return false;
  const ids = `${process.env.OWNER_DISCORD_IDS ?? ""},${process.env.ADMIN_DISCORD_IDS ?? ""}`
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(discordId);
}

export function staffRole(discordId: string | null | undefined, role: Role | null | undefined): StaffRole | null {
  if (isOwnerDiscordId(discordId)) return "OWNER";
  if (role === "ADMIN") return "ADMIN";
  if (role === "MODERATOR") return "MODERATOR";
  return null;
}

const FULL: StaffRole[] = ["OWNER", "ADMIN"];

/** Ce que chaque rôle a le droit de faire. */
export const PERMISSIONS = {
  viewPanel: ["OWNER", "ADMIN", "MODERATOR"],
  editCards: ["OWNER", "ADMIN", "MODERATOR"],
  toggleCards: FULL,
  deleteCards: FULL,
  giftBoosters: FULL,
  seedDemo: FULL,
  viewLog: FULL,
  manageRoles: ["OWNER"],
} satisfies Record<string, StaffRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: StaffRole | null, perm: Permission): boolean {
  return role !== null && (PERMISSIONS[perm] as StaffRole[]).includes(role);
}
