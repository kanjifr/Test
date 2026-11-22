import { prisma } from "@/lib/prisma";
import { lastBackupSent, sendBackupToDiscord, webhookConfigured } from "@/lib/backup";
import { finalizePolls } from "@/lib/polls";
import { announceBirthday } from "@/lib/announce";
import { parisToday } from "@/lib/birthday";
import { finalizeDuelSeason } from "@/lib/seasons";
import { runDueTournaments } from "@/lib/tournaments";
import { adventToday, getAdventConfig, rewardText } from "@/lib/advent";
import { announceText } from "@/lib/announce";
import { siteUrl } from "@/lib/discord";
import { notifyAll } from "@/lib/push";

/** Chaque matin de l'Avent (à partir de 8 h), annonce la nouvelle case sur Discord et en notification. */
async function advent() {
  const t = adventToday();
  if (!t.day) return;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "numeric", hour12: false }).format(new Date()));
  if (hour < 8) return;
  const key = `advent:${t.year}-${t.day}`;
  if (await prisma.setting.findUnique({ where: { key } })) return;
  await prisma.setting.create({ data: { key, value: "1" } });
  const cfg = await getAdventConfig();
  const link = siteUrl("/");
  const teaser = t.day === 24 ? "🌟 C'est le grand jour : le cadeau final t'attend !" : `Aujourd'hui : ${rewardText(cfg.days[t.day - 1])}.`;
  await announceText(`🎄 **La case ${t.day} du calendrier de l'Avent est ouverte !** ${teaser}${link ? ` ${link}` : ""}`);
  await notifyAll("advent", { title: `🎄 Case ${t.day} ouverte !`, body: teaser, url: "/" });
}

/** Souhaite les anniversaires du jour sur Discord, une fois par jour, à partir de 9 h (Paris). */
async function birthdays() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "numeric", hour12: false }).format(new Date()));
  if (hour < 9) return;
  const t = parisToday();
  const key = `birthday:${new Date().getFullYear()}-${t.month}-${t.day}`;
  if (await prisma.setting.findUnique({ where: { key } })) return;
  const people = await prisma.user.findMany({
    where: { consent: true, birthMonth: t.month, birthDay: t.day, featuredIn: { some: { active: true } } },
    select: { name: true, discordId: true },
  });
  await prisma.setting.create({ data: { key, value: String(people.length) } });
  await announceBirthday(people);
}

async function backup() {
  if (!webhookConfigured()) return;
  const last = await lastBackupSent();
  if (!last || Date.now() - last.getTime() > 23 * 3600_000) await sendBackupToDiscord("auto");
}

/** Tâches de fond, vérifiées toutes les 15 minutes. */
export function startScheduler() {
  const g = globalThis as unknown as { __kizunaTimer?: NodeJS.Timeout };
  if (g.__kizunaTimer) return;
  const tick = async () => {
    for (const [name, job] of [["sauvegarde", backup], ["votes", finalizePolls], ["anniversaires", birthdays], ["saison de duel", finalizeDuelSeason], ["tournois", runDueTournaments], ["calendrier de l'Avent", advent]] as const) {
      try {
        await job();
      } catch (e) {
        console.error(`[${name}]`, (e as Error).message);
      }
    }
  };
  setTimeout(tick, 60_000);
  g.__kizunaTimer = setInterval(tick, 15 * 60_000);
}
