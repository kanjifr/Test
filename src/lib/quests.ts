import { prisma } from "@/lib/prisma";

export type QuestField = "packs" | "duelWins" | "duels" | "trades" | "evolutions" | "recycled" | "anecdotes" | "expeditions" | "arenaWins" | "highlow";

export type Quest = { id: string; label: string; field: QuestField; target: number; icon: string };

/** Réserve de quêtes : 3 sont tirées chaque semaine (les mêmes pour tout le monde). */
export const QUEST_POOL: Quest[] = [
  { id: "packs5", label: "Ouvre 5 boosters", field: "packs", target: 5, icon: "🎴" },
  { id: "packs10", label: "Ouvre 10 boosters", field: "packs", target: 10, icon: "🎴" },
  { id: "win3", label: "Gagne 3 duels contre des membres", field: "duelWins", target: 3, icon: "⚔" },
  { id: "win5", label: "Gagne 5 duels contre des membres", field: "duelWins", target: 5, icon: "⚔" },
  { id: "duel5", label: "Livre 5 duels (entraînement compris)", field: "duels", target: 5, icon: "🥋" },
  { id: "trade1", label: "Réalise un échange", field: "trades", target: 1, icon: "⇄" },
  { id: "trade2", label: "Réalise 2 échanges", field: "trades", target: 2, icon: "⇄" },
  { id: "evolve1", label: "Fais évoluer une carte", field: "evolutions", target: 1, icon: "⬆" },
  { id: "evolve3", label: "Fais évoluer des cartes 3 fois", field: "evolutions", target: 3, icon: "⬆" },
  { id: "recycle10", label: "Recycle 10 doublons", field: "recycled", target: 10, icon: "♻" },
  { id: "exp2", label: "Termine 2 expéditions", field: "expeditions", target: 2, icon: "🧭" },
  { id: "exp4", label: "Termine 4 expéditions", field: "expeditions", target: 4, icon: "🧭" },
  { id: "arena5", label: "Gagne 5 combats d'arène", field: "arenaWins", target: 5, icon: "🏟️" },
  { id: "highlow8", label: "Fais une série de 8 au Plus ou moins", field: "highlow", target: 8, icon: "🔼" },
  { id: "story1", label: "Écris une anecdote dans un livre d'or", field: "anecdotes", target: 1, icon: "📖" },
];
export const QUESTS_PER_WEEK = 3;
/** Boosters bonus par quête terminée. */
export const QUEST_REWARD = Math.max(0, Math.floor(Number(process.env.QUEST_REWARD ?? 1)) || 0);

/** Semaine ISO (lundi → dimanche) à l'heure de Paris, ex : « 2026-W47 ». */
export function currentWeek(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lundi
  d.setUTCDate(d.getUTCDate() - dow + 3); // jeudi de la semaine
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Lundi prochain à minuit (Paris) : fin des quêtes de la semaine. */
export function weekEnd(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() + 7 - dow);
  const paris = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(d.getTime() - (paris.getTime() - utc.getTime()));
}

/** Les 3 quêtes de la semaine, jamais deux sur le même objectif. */
export function questsOfWeek(week = currentWeek()): Quest[] {
  let h = 2166136261;
  for (const ch of week) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rand = () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return h / 4294967296;
  };
  const pool = [...QUEST_POOL];
  const out: Quest[] = [];
  while (out.length < QUESTS_PER_WEEK && pool.length) {
    const q = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    if (!out.some((o) => o.field === q.field)) out.push(q);
  }
  return out;
}

/** Ajoute de la progression aux quêtes de la semaine (ne fait jamais échouer l'action du joueur). */
export async function recordProgress(userId: string, field: QuestField, n = 1) {
  if (n <= 0) return;
  const week = currentWeek();
  await prisma.weeklyProgress
    .upsert({
      where: { userId_week: { userId, week } },
      create: { userId, week, [field]: n },
      update: { [field]: { increment: n } },
    })
    .catch((e) => console.error("[quêtes]", (e as Error).message));
}

export async function questStatus(userId: string) {
  const week = currentWeek();
  const row = await prisma.weeklyProgress.findUnique({ where: { userId_week: { userId, week } } });
  return questsOfWeek(week).map((q) => {
    const value = row?.[q.field] ?? 0;
    return { ...q, value: Math.min(value, q.target), done: value >= q.target, claimed: !!row?.claimed.includes(q.id) };
  });
}
