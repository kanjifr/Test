import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can, staffRole, type Permission, type StaffRole } from "@/lib/admin";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return session.user;
}

/** Vérifie la permission avec le rôle lu en base (jamais celui mis en cache dans la session). */
export async function requireStaff(perm: Permission) {
  const user = await requireUser();
  const db = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true, name: true } });
  const role = staffRole(user.discordId, db?.role);
  if (!can(role, perm)) redirect("/");
  return { ...user, name: db?.name ?? user.name, role: role as StaffRole };
}

export async function logAdmin(actor: { id: string; name?: string | null }, action: string, details: string) {
  await prisma.adminLog.create({
    data: { actorId: actor.id, actorName: actor.name ?? "?", action, details },
  });
}
