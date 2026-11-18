import { prisma } from "@/lib/prisma";
import { lastBackupSent, sendBackupToDiscord, webhookConfigured } from "@/lib/backup";
import { finalizePolls } from "@/lib/polls";
import { announceBirthday } from "@/lib/announce";
import { parisToday } from "@/lib/birthday";

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
    for (const [name, job] of [["sauvegarde", backup], ["votes", finalizePolls], ["anniversaires", birthdays]] as const) {
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
