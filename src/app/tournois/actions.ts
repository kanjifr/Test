"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logAdmin, requireStaff, requireUser } from "@/lib/session";
import { MAX_PLAYERS, runTournament } from "@/lib/tournaments";
import { DUEL_TEAM_SIZE } from "@/lib/duel-server";
import { announceText } from "@/lib/announce";
import { siteUrl } from "@/lib/discord";
import { notifyAll } from "@/lib/push";

const back = (msg: string, ok = false) => redirect(`/tournois?${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);

/** « AAAA-MM-JJTHH:MM » (heure de Paris) → Date */
function parisDateTime(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const utc = new Date(`${v}:00Z`);
  if (Number.isNaN(utc.getTime())) return null;
  const paris = new Date(utc.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const asUtc = new Date(utc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(utc.getTime() - (paris.getTime() - asUtc.getTime()));
}

export async function joinTournament(fd: FormData) {
  const me = await requireUser();
  const id = String(fd.get("id") ?? "");
  const t = await prisma.tournament.findUnique({ where: { id }, include: { _count: { select: { entries: true } } } });
  if (!t || t.status !== "REGISTRATION" || t.startsAt <= new Date()) back("Les inscriptions sont fermées.");
  if (t!._count.entries >= MAX_PLAYERS) back(`Le tournoi est complet (${MAX_PLAYERS} participants).`);
  const cards = await prisma.userCard.count({ where: { userId: me.id, card: { active: true } } });
  if (cards < DUEL_TEAM_SIZE) back(`Il te faut au moins ${DUEL_TEAM_SIZE} cartes différentes pour participer.`);
  await prisma.tournamentEntry.upsert({ where: { tournamentId_userId: { tournamentId: id, userId: me.id } }, create: { tournamentId: id, userId: me.id }, update: {} });
  revalidatePath("/tournois");
  back("Inscription validée ! Ton équipe de défense combattra pour toi.", true);
}

export async function leaveTournament(fd: FormData) {
  const me = await requireUser();
  const id = String(fd.get("id") ?? "");
  await prisma.tournamentEntry.deleteMany({ where: { tournamentId: id, userId: me.id, tournament: { status: "REGISTRATION" } } });
  revalidatePath("/tournois");
  back("Tu t'es désinscrit.", true);
}

export async function createTournament(fd: FormData) {
  const me = await requireStaff("manageTournaments");
  const name = String(fd.get("name") ?? "").trim().slice(0, 50);
  const startsAt = parisDateTime(String(fd.get("startsAt") ?? ""));
  const reward = Math.min(20, Math.max(0, Math.floor(Number(fd.get("reward") ?? 3)) || 0));
  if (!name) back("Donne un nom au tournoi.");
  if (!startsAt || startsAt.getTime() < Date.now() + 5 * 60_000) back("Choisis une date de début dans au moins 5 minutes.");
  const t = await prisma.tournament.create({ data: { name, startsAt: startsAt!, reward } });
  await logAdmin(me, "tournament.create", `a créé le tournoi « ${t.name} »`);
  if (fd.get("announce") === "on") {
    const when = t.startsAt.toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
    const link = siteUrl("/tournois");
    await notifyAll("tournament", { title: `🏆 Nouveau tournoi : ${t.name}`, body: `Inscriptions ouvertes jusqu'au ${when}.`, url: "/tournois" });
    await announceText(`🏆 **Nouveau tournoi : ${t.name} !** Inscriptions ouvertes jusqu'au ${when}. Le vainqueur gagne ${t.reward} booster${t.reward > 1 ? "s" : ""} bonus et un titre.${link ? ` Inscris-toi : ${link}` : ""}`);
  }
  revalidatePath("/tournois");
  back(`Tournoi « ${t.name} » créé.`, true);
}

export async function cancelTournament(fd: FormData) {
  const me = await requireStaff("manageTournaments");
  const id = String(fd.get("id") ?? "");
  const done = await prisma.tournament.updateMany({ where: { id, status: "REGISTRATION" }, data: { status: "CANCELLED" } });
  if (done.count) {
    const t = await prisma.tournament.findUnique({ where: { id } });
    await logAdmin(me, "tournament.cancel", `a annulé le tournoi « ${t?.name} »`);
  }
  revalidatePath("/tournois");
}

/** Lance le tournoi tout de suite, sans attendre l'heure prévue. */
export async function startTournamentNow(fd: FormData) {
  const me = await requireStaff("manageTournaments");
  const id = String(fd.get("id") ?? "");
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t || t.status !== "REGISTRATION") back("Ce tournoi n'est plus en inscription.");
  await logAdmin(me, "tournament.start", `a lancé le tournoi « ${t!.name} »`);
  try {
    await runTournament(id);
  } catch (e) {
    await prisma.duel.deleteMany({ where: { tournamentId: id } });
    await prisma.seasonAward.deleteMany({ where: { kind: "TOURNAMENT", period: id } });
    await prisma.tournament.updateMany({ where: { id, winnerId: null }, data: { status: "REGISTRATION" } });
    back(`Le lancement a échoué : ${(e as Error).message}`);
  }
  revalidatePath("/", "layout");
  redirect(`/tournois/${id}`);
}
