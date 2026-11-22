import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/admin";
import { lastBackupSent, webhookConfigured } from "@/lib/backup";
import { announceConfigured } from "@/lib/announce";
import { adventToday, getAdventConfig } from "@/lib/advent";
import { parisDayStart } from "@/lib/duel-server";
import { fmtCoins } from "@/lib/coins";

export const dynamic = "force-dynamic";

type Todo = { level: "urgent" | "info"; text: string; href: string; action: string };

export default async function AdminDashboard() {
  const me = await requireStaff("viewPanel");
  const now = new Date();
  const today = parisDayStart(now);
  const week = new Date(now.getTime() - 7 * 86400_000);
  const allow = {
    anecdotes: can(me.role, "moderateAnecdotes"),
    polls: can(me.role, "managePolls"),
    backups: can(me.role, "manageBackups"),
    announce: can(me.role, "manageAnnouncements"),
    advent: can(me.role, "manageAdvent"),
    tournaments: can(me.role, "manageTournaments"),
    log: can(me.role, "viewLog"),
    import: can(me.role, "importCards"),
    gift: can(me.role, "giftBoosters"),
  };

  const [members, activeWeek, cards, noImage, packsToday, pullsWeek, duelsToday, tradesWeek, coins, pending, openPolls, openTournaments, logs] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { lastPackAt: { gte: week } } }),
    prisma.card.count({ where: { active: true } }),
    prisma.card.count({ where: { active: true, imageUrl: null, subjectId: null } }),
    prisma.pull.groupBy({ by: ["userId"], where: { createdAt: { gte: today } } }).then((r) => r.length),
    prisma.pull.count({ where: { createdAt: { gte: week } } }),
    prisma.duel.count({ where: { createdAt: { gte: today } } }),
    prisma.trade.count({ where: { status: "ACCEPTED", resolvedAt: { gte: week } } }),
    prisma.user.aggregate({ _sum: { coins: true } }),
    allow.anecdotes ? prisma.anecdote.count({ where: { status: "PENDING" } }) : 0,
    prisma.poll.count({ where: { closesAt: { gt: now } } }),
    prisma.tournament.findMany({ where: { status: "REGISTRATION" }, select: { name: true, startsAt: true, _count: { select: { entries: true } } }, orderBy: { startsAt: "asc" } }),
    allow.log ? prisma.adminLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }) : [],
  ]);

  // ---- À faire ----
  const todos: Todo[] = [];
  if (pending > 0) todos.push({ level: "urgent", text: `${pending} anecdote${pending > 1 ? "s" : ""} à valider dans le livre d'or`, href: "/admin/communaute", action: "Valider" });
  if (allow.advent) {
    const t = adventToday(now);
    if (t.month === 11 || (t.month === 12 && t.date <= 24)) {
      const cfg = await getAdventConfig();
      const xmas = await prisma.card.findMany({ where: { active: true, exclusive: true, eventName: cfg.eventName }, select: { rarity: true } });
      if (xmas.length === 0) todos.push({ level: "urgent", text: `Aucune carte de Noël exclusive pour le calendrier de l'Avent (événement « ${cfg.eventName} », case « Exclusive » cochée)`, href: "/admin/cartes", action: "Créer" });
      else if (!xmas.some((c) => c.rarity === "LEGENDAIRE")) todos.push({ level: "urgent", text: "Pas encore de Légendaire de Noël pour le grand cadeau du 24 décembre", href: "/admin/cartes", action: "Créer" });
      else todos.push({ level: "info", text: `${xmas.length} carte${xmas.length > 1 ? "s" : ""} de Noël prêtes pour le calendrier`, href: "/admin/avent", action: "Voir" });
    }
  }
  if (allow.backups) {
    if (!webhookConfigured()) todos.push({ level: "info", text: "Sauvegardes automatiques sur Discord pas encore activées", href: "/admin/sauvegardes", action: "Voir" });
    else {
      const last = await lastBackupSent();
      if (!last || now.getTime() - last.getTime() > 2 * 86400_000) todos.push({ level: "urgent", text: "Aucune sauvegarde envoyée depuis plus de 2 jours", href: "/admin/sauvegardes", action: "Sauvegarder" });
    }
  }
  if (allow.announce && !announceConfigured()) todos.push({ level: "info", text: "Annonces Discord pas encore activées", href: "/admin/reglages", action: "Voir" });
  if (noImage > 0) todos.push({ level: "info", text: `${noImage} carte${noImage > 1 ? "s" : ""} sans image ni membre lié (initiales affichées)`, href: "/admin/cartes?filtre=sansimage", action: "Voir" });
  for (const t of openTournaments)
    todos.push({
      level: "info",
      text: `Tournoi « ${t.name} » : ${t._count.entries} inscrit${t._count.entries > 1 ? "s" : ""}, début ${t.startsAt.toLocaleString("fr-FR", { weekday: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}`,
      href: "/tournois",
      action: "Voir",
    });

  const stats = [
    { n: members, label: "membres", sub: `${activeWeek} actifs cette semaine` },
    { n: packsToday, label: "joueurs aujourd'hui", sub: `${pullsWeek} cartes tirées en 7 jours` },
    { n: cards, label: "cartes actives", sub: noImage ? `${noImage} sans image` : "toutes illustrées" },
    { n: duelsToday, label: "duels aujourd'hui", sub: `${tradesWeek} échanges en 7 jours` },
    { n: fmtCoins(coins._sum.coins ?? 0), label: "pièces en circulation", sub: `${openPolls} vote${openPolls > 1 ? "s" : ""} en cours` },
  ];

  const shortcuts = [
    { href: "/admin/cartes", label: "Nouvelle carte", icon: "＋" },
    ...(allow.import ? [{ href: "/admin/import", label: "Importer un Excel", icon: "表" }] : []),
    ...(allow.polls ? [{ href: "/admin/communaute#votes", label: "Lancer un vote", icon: "票" }] : []),
    ...(allow.tournaments ? [{ href: "/tournois", label: "Créer un tournoi", icon: "陣" }] : []),
    ...(allow.gift ? [{ href: "/admin/membres", label: "Offrir un booster", icon: "贈" }] : []),
  ];

  return (
    <section className="admin">
      <h1>Tableau de bord</h1>
      <div className="dash-stats">
        {stats.map((s) => (
          <div key={s.label} className="panel dash-stat">
            <b>{s.n}</b>
            <span>{s.label}</span>
            <small className="muted">{s.sub}</small>
          </div>
        ))}
      </div>

      <div className="dash-cols">
        <div className="panel">
          <h2>À faire</h2>
          {todos.length === 0 ? (
            <p className="muted">✓ Rien d&apos;urgent, tout roule !</p>
          ) : (
            <ul className="todo-list">
              {todos.map((t, i) => (
                <li key={i} className={t.level}>
                  <span className="todo-dot" aria-hidden />
                  <span>{t.text}</span>
                  <Link href={t.href} className="btn btn-sm btn-ghost">
                    {t.action}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          <h2>Raccourcis</h2>
          <div className="more-grid">
            {shortcuts.map((s) => (
              <Link key={s.label} href={s.href} className="more-item">
                <span className="more-icon" aria-hidden>
                  {s.icon}
                </span>
                <span>{s.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {allow.log && logs.length > 0 && (
        <div className="panel log-panel">
          <div className="page-head">
            <h2>Dernières actions</h2>
            <Link href="/admin/journal" className="small-text">
              Tout le journal →
            </Link>
          </div>
          <ul className="log">
            {logs.map((l) => (
              <li key={l.id}>
                <time className="muted">{l.createdAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}</time>
                <span>
                  <b>{l.actorName}</b> {l.details}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
