import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "./uploads");
export const UPLOAD_PREFIX = "/api/uploads/";
export const FILE_RE = /^[a-f0-9]{24}\.(png|jpg|webp|gif)$/;

const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
export const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};
const MAX_BYTES = 5 * 1024 * 1024;

export async function saveUpload(file: File): Promise<string> {
  const ext = TYPES[file.type];
  if (!ext) throw new Error("Format d'image non supporté (PNG, JPG, WEBP ou GIF).");
  if (file.size > MAX_BYTES) throw new Error("Image trop lourde (5 Mo max).");
  const buf = Buffer.from(await file.arrayBuffer());
  const name = `${randomBytes(12).toString("hex")}.${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, name), buf);
  return UPLOAD_PREFIX + name;
}

export async function readUpload(name: string) {
  if (!FILE_RE.test(name)) return null;
  try {
    const data = await readFile(path.join(UPLOAD_DIR, name));
    return { data, type: MIME[name.split(".").pop()!] };
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
