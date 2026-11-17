import { randomBytes } from "node:crypto";
import { mkdir, writeFile, stat, unlink } from "node:fs/promises";
import path from "node:path";

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "./uploads");
export const UPLOAD_PREFIX = "/api/uploads/";
export const FILE_RE = /^[a-f0-9]{24}\.(png|jpg|webp|gif|mp4|webm)$/;

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};
export const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
};
export const MAX_IMAGE_MB = 5;
export const MAX_VIDEO_MB = 40;

export async function saveUpload(file: File, kind: "image" | "video" = "image"): Promise<string> {
  const ext = (kind === "video" ? VIDEO_TYPES : IMAGE_TYPES)[file.type];
  if (!ext) {
    throw new Error(
      kind === "video" ? "Format de vidéo non supporté (MP4 ou WEBM)." : "Format d'image non supporté (PNG, JPG, WEBP ou GIF).",
    );
  }
  const max = (kind === "video" ? MAX_VIDEO_MB : MAX_IMAGE_MB) * 1024 * 1024;
  if (file.size > max) {
    throw new Error(kind === "video" ? `Vidéo trop lourde (${MAX_VIDEO_MB} Mo max).` : `Image trop lourde (${MAX_IMAGE_MB} Mo max).`);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const name = `${randomBytes(12).toString("hex")}.${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, name), buf);
  return UPLOAD_PREFIX + name;
}

export async function statUpload(name: string) {
  if (!FILE_RE.test(name)) return null;
  const file = path.join(UPLOAD_DIR, name);
  try {
    const st = await stat(file);
    return { file, size: st.size, type: MIME[name.split(".").pop()!] };
  } catch {
    return null;
  }
}

export async function deleteUpload(url: string | null | undefined) {
  if (!url?.startsWith(UPLOAD_PREFIX)) return;
  const name = url.slice(UPLOAD_PREFIX.length);
  if (!FILE_RE.test(name)) return;
  await unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
}
