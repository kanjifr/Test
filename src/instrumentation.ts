export async function register() {
  // Tâches de fond : sauvegarde quotidienne, fin des votes, anniversaires (côté serveur Node.js uniquement)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
