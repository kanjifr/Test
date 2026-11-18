import type { Card, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toCardView } from "@/lib/cards";
import type { CardView } from "@/lib/game";
import { power, type Fighter } from "@/lib/duel";

export const DUEL_TEAM_SIZE = 3;
const intEnv = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : d);
/** Duels contre des membres par jour et par joueur */
export const DUEL_DAILY_LIMIT = intEnv(process.env.DUEL_DAILY_LIMIT, 10);
/** Duels contre un même membre par jour */
export const DUEL_SAME_OPPONENT_LIMIT = intEnv(process.env.DUEL_SAME_OPPONENT_LIMIT, 3);
/** Boosters bonus gagnés pour la première victoire du jour (0 = désactivé) */
export const DUEL_DAILY_REWARD = intEnv(process.env.DUEL_DAILY_REWARD, 1);

type CardWithSubject = Card & { subject?: Pick<User, "image" | "consent"> | null };
/** Une carte en duel garde toutes les infos d'affichage (CardView est compatible avec Fighter). */
export const toFighter = (c: CardWithSubject): CardView => toCardView(c);

/** Minuit (heure de Paris) du jour en cours. */
export function parisDayStart(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  const paris = new Date(utcMidnight.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const utc = new Date(utcMidnight.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(utcMidnight.getTime() - (paris.getTime() - utc.getTime()));
}

const cardInclude = { card: { include: { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } } } } as const;

/** Cartes possédées (actives) d'un membre, de la plus forte à la plus faible. */
export async function ownedFighters(userId: string) {
  const owned = await prisma.userCard.findMany({ where: { userId, card: { active: true } }, include: cardInclude });
  return owned.map((o) => toFighter(o.card)).sort((a, b) => power(b) - power(a) || a.number - b.number);
}

/** Équipe de défense : celle choisie par le membre, complétée par ses cartes les plus fortes. */
export async function defenseTeamOf(userId: string): Promise<CardView[]> {
  const [user, owned] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { defenseTeam: true } }),
    ownedFighters(userId),
  ]);
  const byId = new Map(owned.map((f) => [f.id, f]));
  const team = (user?.defenseTeam ?? []).map((id) => byId.get(id)).filter((f): f is CardView => !!f);
  for (const f of owned) {
    if (team.length >= DUEL_TEAM_SIZE) break;
    if (!team.some((t) => t.id === f.id)) team.push(f);
  }
  return team.slice(0, DUEL_TEAM_SIZE);
}

/** Adversaire d'entraînement : 3 cartes d'un niveau proche de l'équipe du joueur. */
export async function trainingTeam(team: Fighter[], rand: () => number): Promise<CardView[]> {
  const cards = await prisma.card.findMany({ where: { active: true }, include: { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } } });
  const avg = team.reduce((s, f) => s + power(f), 0) / Math.max(1, team.length);
  const pool = cards
    .map(toFighter)
    .sort((a, b) => Math.abs(power(a) - avg) - Math.abs(power(b) - avg))
    .slice(0, Math.max(DUEL_TEAM_SIZE, 8));
  const out: CardView[] = [];
  while (out.length < DUEL_TEAM_SIZE && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}
