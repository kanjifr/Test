export function isAdminDiscordId(discordId?: string | null): boolean {
  if (!discordId) return false;
  const ids = (process.env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(discordId);
}
