import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can, ROLE_LABELS } from "@/lib/admin";
import { AdminNav, type AdminTab } from "@/components/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff("viewPanel");
  const pending = can(me.role, "moderateAnecdotes") ? await prisma.anecdote.count({ where: { status: "PENDING" } }) : 0;
  const tabs: AdminTab[] = [
    { href: "/admin", label: "Tableau de bord", icon: "盤" },
    { href: "/admin/cartes", label: "Cartes", icon: "札" },
    ...(can(me.role, "manageSeries") ? [{ href: "/admin/series", label: "Séries", icon: "季" }] : []),
    ...(can(me.role, "importCards") ? [{ href: "/admin/import", label: "Import Excel", icon: "表" }] : []),
    ...(can(me.role, "giftBoosters") || can(me.role, "manageRoles") ? [{ href: "/admin/membres", label: "Membres", icon: "人" }] : []),
    ...(can(me.role, "moderateAnecdotes") || can(me.role, "managePolls")
      ? [{ href: "/admin/communaute", label: "Livre d'or et votes", icon: "話", badge: pending }]
      : []),
    ...(can(me.role, "manageAdvent") ? [{ href: "/admin/avent", label: "Calendrier de l'Avent", icon: "雪" }] : []),
    ...(can(me.role, "manageShop") ? [{ href: "/admin/boutique", label: "Boutique et pièces", icon: "店" }] : []),
    ...(can(me.role, "manageTheme") || can(me.role, "manageAnnouncements") ? [{ href: "/admin/reglages", label: "Thème et annonces", icon: "設" }] : []),
    ...(can(me.role, "manageBackups") ? [{ href: "/admin/sauvegardes", label: "Sauvegardes", icon: "蔵" }] : []),
    ...(can(me.role, "viewLog") ? [{ href: "/admin/journal", label: "Journal", icon: "録" }] : []),
  ];
  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <p className="admin-who">
          Panel admin · <b className="role-chip">{ROLE_LABELS[me.role]}</b>
        </p>
        <AdminNav tabs={tabs} />
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  );
}
