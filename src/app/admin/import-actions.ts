"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAdmin, requireStaff } from "@/lib/session";
import { readImportTable } from "@/lib/import";
import { deleteUpload, saveUpload } from "@/lib/uploads";
import { checkAchievements } from "@/lib/achievements-server";
import { norm } from "@/lib/csv";
import { parisDay } from "@/lib/series";

export type ImportPreviewRow = {
  line: number;
  name: string;
  rarity: string | null;
  element: string | null;
  image: string;
  video: string;
  member: string;
  action: "create" | "update";
  errors: string[];
};
export type ImportResult =
  | { ok: false; error: string; rows?: ImportPreviewRow[] }
  | { ok: true; done: boolean; rows: ImportPreviewRow[]; created: number; updated: number };

const baseName = (s: string) => norm(s.split(/[\\/]/).pop() ?? s);

export async function importCards(fd: FormData): Promise<ImportResult> {
  const me = await requireStaff("importCards");
  const doImport = fd.get("mode") === "import";
  const updateExisting = fd.get("updateExisting") === "on";

  const csv = fd.get("csv");
  if (!(csv instanceof File) || csv.size === 0) return { ok: false, error: "Choisis un fichier CSV." };
  if (csv.size > 2 * 1024 * 1024) return { ok: false, error: "Fichier CSV trop gros (2 Mo max)." };
  const { rows, error } = readImportTable(await csv.text());
  if (error) return { ok: false, error };

  // Fichiers envoyés avec le tableau, retrouvés par leur nom
  const files = new Map<string, File>();
  for (const f of fd.getAll("files")) if (f instanceof File && f.size > 0) files.set(baseName(f.name), f);

  const [existing, members, seriesList] = await Promise.all([
    prisma.card.findMany({ select: { id: true, name: true, number: true, variantOfId: true } }),
    prisma.user.findMany({ select: { id: true, name: true, discordId: true, consent: true } }),
    prisma.series.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const seriesByName = new Map(seriesList.map((x) => [norm(x.name), x.id]));
  const byName = new Map(existing.map((c) => [norm(c.name), c.id]));
  const seen = new Map<string, number>();

  const resolveMedia = (value: string, kind: "image" | "vidéo", errors: string[]) => {
    if (!value) return null;
    if (/^https:\/\//i.test(value)) return { url: value };
    if (/^http:\/\//i.test(value)) {
      errors.push(`l'adresse de la ${kind} doit commencer par https://`);
      return null;
    }
    const f = files.get(baseName(value));
    if (!f) {
      errors.push(`${kind} « ${value} » non envoyée avec le tableau`);
      return null;
    }
    return { file: f };
  };

  const plan = rows.map((r) => {
    const errors = [...r.errors];
    const key = norm(r.name);
    const dup = key ? seen.get(key) : undefined;
    if (dup !== undefined) errors.push(`même nom qu'à la ligne ${dup}`);
    else if (key) seen.set(key, r.line);
    const existingId = byName.get(key);
    if (existingId && !updateExisting) errors.push("une carte porte déjà ce nom (coche « mettre à jour » pour la modifier)");

    let subjectId: string | null = null;
    if (r.member) {
      const m = members.find((u) => u.discordId === r.member || norm(u.name ?? "") === norm(r.member));
      if (!m) errors.push(`membre « ${r.member} » introuvable (il doit s'être connecté au moins une fois)`);
      else if (!m.consent) errors.push(`${m.name} n'a pas accepté d'apparaître sur une carte`);
      else subjectId = m.id;
    }
    let seriesId: string | null | undefined;
    if (r.series !== undefined) {
      seriesId = r.series ? (seriesByName.get(norm(r.series)) ?? null) : null;
      if (r.series && !seriesId) errors.push(`série « ${r.series} » inconnue (crée-la d'abord dans le panel admin, section Séries)`);
    }
    // La carte d'origine d'une alternative doit déjà exister sur le site (nom ou numéro)
    let variantOfId: string | null | undefined;
    if (r.variantOf !== undefined) {
      variantOfId = null;
      if (r.variantOf) {
        const n = Number(r.variantOf.replace(/^#/, ""));
        const base = existing.find((c) => (Number.isInteger(n) && c.number === n) || norm(c.name) === norm(r.variantOf!));
        if (!base) errors.push(`carte d'origine « ${r.variantOf} » introuvable (importe-la d'abord)`);
        else if (base.id === existingId) errors.push("une carte ne peut pas être sa propre version alternative");
        else variantOfId = base.variantOfId ?? base.id;
      }
    }
    const image = resolveMedia(r.image, "image", errors);
    const video = resolveMedia(r.video, "vidéo", errors);
    if (video?.url && !/\.(mp4|webm)(\?.*)?$/i.test(video.url)) errors.push("la vidéo doit être un .mp4 ou .webm");
    return { r, errors, existingId, subjectId, image, video, seriesId, variantOfId };
  });

  const preview: ImportPreviewRow[] = plan.map((p) => ({
    line: p.r.line,
    name: p.r.name,
    rarity: p.r.rarity,
    element: p.r.element,
    image: p.r.image,
    video: p.r.video,
    member: p.r.member,
    action: p.existingId ? "update" : "create",
    errors: p.errors,
  }));
  const counts = { created: plan.filter((p) => !p.existingId).length, updated: plan.filter((p) => p.existingId).length };
  const errorCount = plan.filter((p) => p.errors.length).length;

  if (!doImport) return { ok: true, done: false, rows: preview, ...counts };
  if (errorCount) {
    return { ok: false, error: `${errorCount} ligne(s) en erreur : rien n'a été importé. Corrige-les puis réessaie.`, rows: preview };
  }

  // Envoi des fichiers, puis création des cartes en une seule fois (tout ou rien)
  const saved: string[] = [];
  try {
    const upload = async (m: { url?: string; file?: File } | null, kind: "image" | "video") => {
      if (!m) return null;
      if (m.url) return m.url;
      const url = await saveUpload(m.file!, kind);
      saved.push(url);
      return url;
    };
    const data = [];
    for (const p of plan) {
      data.push({
        existingId: p.existingId,
        card: {
          name: p.r.name,
          title: p.r.title,
          description: p.r.description,
          rarity: p.r.rarity!,
          element: p.r.element!,
          attack: p.r.attack,
          defense: p.r.defense,
          subjectId: p.subjectId,
          // Sans colonne « serie », une nouvelle carte rejoint la série la plus récente
          ...(p.seriesId !== undefined ? { seriesId: p.seriesId } : p.existingId ? {} : { seriesId: seriesList.at(-1)?.id ?? null }),
          ...(p.variantOfId !== undefined ? { variantOfId: p.variantOfId } : {}),
          ...(p.r.event !== undefined ? { eventName: p.r.event || null } : {}),
          ...(p.r.from !== undefined ? { availableFrom: p.r.from ? parisDay(p.r.from, false) : null } : {}),
          ...(p.r.until !== undefined ? { availableUntil: p.r.until ? parisDay(p.r.until, true) : null } : {}),
          ...(p.image ? { imageUrl: await upload(p.image, "image") } : {}),
          ...(p.video ? { videoUrl: await upload(p.video, "video") } : {}),
        },
      });
    }
    await prisma.$transaction(
      data.map((d) =>
        d.existingId
          ? prisma.card.update({ where: { id: d.existingId }, data: d.card })
          : prisma.card.create({ data: d.card }),
      ),
    );
  } catch (e) {
    await Promise.all(saved.map((u) => deleteUpload(u)));
    return { ok: false, error: `L'import a échoué, rien n'a été modifié : ${(e as Error).message}`, rows: preview };
  }

  await logAdmin(me, "card.import", `a importé ${counts.created} carte(s) et en a mis à jour ${counts.updated} depuis un tableau`);
  const subjects = [...new Set(plan.map((p) => p.subjectId).filter((s): s is string => !!s))];
  await Promise.all(subjects.map((s) => checkAchievements(s)));
  revalidatePath("/", "layout");
  return { ok: true, done: true, rows: preview, ...counts };
}
