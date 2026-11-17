export async function register() {
  // Sauvegarde automatique quotidienne (uniquement côté serveur Node.js)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackupScheduler } = await import("@/lib/backup");
    startBackupScheduler();
  }
}
