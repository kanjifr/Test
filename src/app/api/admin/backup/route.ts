import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can, staffRole } from "@/lib/admin";
import { backupFile } from "@/lib/backup";
import { logAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Non connecté", { status: 401 });
  const db = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true, name: true } });
  if (!can(staffRole(session.user.discordId, db?.role), "manageBackups")) return new Response("Accès refusé", { status: 403 });

  const { buf, name } = await backupFile();
  await logAdmin({ id: session.user.id, name: db?.name }, "backup.download", "a téléchargé une sauvegarde");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
