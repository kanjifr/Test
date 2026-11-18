import { gunzipSync, gzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/uploads";
import { SITE_NAME } from "@/lib/game";
import { WEBHOOK_RE } from "@/lib/discord";

const FORMAT = "kizuna-backup";
const VERSION = 1;

/**
 * Sauvegarde complète du jeu (sans l'historique des tirages, qui ne sert qu'au fil d'actualité,
 * et sans les jetons de connexion Discord). Les images et vidéos restent dans le volume.
 */
export async function buildBackup() {
  const [users, accounts, cards, userCards, trades, tradeItems, achievements, logs, polls, pollOptions, pollVotes] = await Promise.all([
    prisma.user.findMany(),
    prisma.account.findMany({ select: { userId: true, type: true, provider: true, providerAccountId: true, createdAt: true, updatedAt: true } }),
    prisma.card.findMany(),
    prisma.userCard.findMany(),
    prisma.trade.findMany(),
    prisma.tradeItem.findMany(),
    prisma.userAchievement.findMany(),
    prisma.adminLog.findMany(),
    prisma.poll.findMany(),
    prisma.pollOption.findMany(),
    prisma.pollVote.findMany(),
  ]);
  const data = { users, accounts, cards, userCards, trades, tradeItems, achievements, logs, polls, pollOptions, pollVotes };
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  return { format: FORMAT, version: VERSION, site: SITE_NAME, createdAt: new Date().toISOString(), counts, data };
}

export type Backup = Awaited<ReturnType<typeof buildBackup>>;

export async function backupFile() {
  const backup = await buildBackup();
  const buf = gzipSync(Buffer.from(JSON.stringify(backup)));
  const day = backup.createdAt.slice(0, 10);
  return { buf, name: `${SITE_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-sauvegarde-${day}.json.gz`, backup };
}

export function readBackup(buf: Buffer): Backup {
  const raw = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  let parsed: Backup;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde valide.");
  }
  if (parsed?.format !== FORMAT || typeof parsed.data !== "object") throw new Error("Ce fichier n'est pas une sauvegarde du site.");
  if (parsed.version > VERSION) throw new Error("Cette sauvegarde vient d'une version plus récente du site.");
  return parsed;
}

/** Copie de sécurité écrite sur le disque (volume), jamais servie publiquement. */
export async function saveLocalCopy(prefix: string) {
  const { buf } = await backupFile();
  const dir = path.join(UPLOAD_DIR, "backups");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json.gz`);
  await writeFile(file, buf);
  return file;
}

/** Remplace TOUTES les données du jeu par celles de la sauvegarde. */
export async function restoreBackup(b: Backup) {
  const d = b.data;
  await prisma.$transaction(
    async (tx) => {
      await tx.pollVote.deleteMany();
      await tx.pollOption.deleteMany();
      await tx.poll.deleteMany();
      await tx.tradeItem.deleteMany();
      await tx.trade.deleteMany();
      await tx.userAchievement.deleteMany();
      await tx.userCard.deleteMany();
      await tx.pull.deleteMany();
      await tx.adminLog.deleteMany();
      await tx.card.deleteMany();
      await tx.account.deleteMany();
      await tx.session.deleteMany();
      await tx.user.deleteMany();

      await tx.user.createMany({ data: d.users });
      await tx.account.createMany({ data: d.accounts });
      await tx.card.createMany({ data: d.cards });
      // Les contre-propositions font référence à d'autres échanges : on relie après coup
      await tx.trade.createMany({ data: d.trades.map((t) => ({ ...t, parentId: null })) });
      for (const t of d.trades.filter((t) => t.parentId)) {
        await tx.trade.update({ where: { id: t.id }, data: { parentId: t.parentId } });
      }
      await tx.tradeItem.createMany({ data: d.tradeItems });
      await tx.userCard.createMany({ data: d.userCards });
      await tx.userAchievement.createMany({ data: d.achievements });
      await tx.adminLog.createMany({ data: d.logs });
      // Votes (absents des sauvegardes faites avant leur ajout)
      if (d.polls?.length) {
        await tx.poll.createMany({ data: d.polls });
        await tx.pollOption.createMany({ data: d.pollOptions ?? [] });
        await tx.pollVote.createMany({ data: d.pollVotes ?? [] });
      }
      // Les prochaines cartes créées continuent la numérotation
      await tx.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"Card"', 'number'), GREATEST(COALESCE((SELECT MAX("number") FROM "Card"), 0), 1), (SELECT COUNT(*) > 0 FROM "Card"))`,
      );
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

export const webhookConfigured = () => WEBHOOK_RE.test(process.env.BACKUP_DISCORD_WEBHOOK_URL ?? "");

/** Envoie la sauvegarde en pièce jointe dans un salon Discord privé (webhook). */
export async function sendBackupToDiscord(reason: "auto" | "manual") {
  const url = process.env.BACKUP_DISCORD_WEBHOOK_URL ?? "";
  if (!WEBHOOK_RE.test(url)) throw new Error("BACKUP_DISCORD_WEBHOOK_URL n'est pas configurée (ou n'est pas une adresse de webhook Discord).");
  const { buf, name, backup } = await backupFile();
  if (buf.length > 9.5 * 1024 * 1024) throw new Error("Sauvegarde trop lourde pour Discord (10 Mo max) : télécharge-la depuis le panel.");
  const c = backup.counts;
  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      content: `💾 Sauvegarde ${reason === "auto" ? "automatique" : "manuelle"} de **${SITE_NAME}** : ${c.users} membres, ${c.cards} cartes, ${c.userCards} cartes en collection, ${c.trades} échanges.`,
      allowed_mentions: { parse: [] },
    }),
  );
  form.append("files[0]", new Blob([new Uint8Array(buf)], { type: "application/gzip" }), name);
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Discord a refusé l'envoi (${res.status}).`);
  await prisma.adminLog.create({
    data: {
      actorId: null,
      actorName: reason === "auto" ? "Sauvegarde automatique" : "Sauvegarde",
      action: reason === "auto" ? "backup.auto" : "backup.discord",
      details: `a envoyé une sauvegarde sur Discord (${(buf.length / 1024).toFixed(0)} Ko)`,
    },
  });
}

export async function lastBackupSent() {
  const last = await prisma.adminLog.findFirst({
    where: { action: { in: ["backup.auto", "backup.discord"] } },
    orderBy: { createdAt: "desc" },
  });
  return last?.createdAt ?? null;
}
