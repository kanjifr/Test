export type Tier = "BRONZE" | "ARGENT" | "OR";

export const TIERS: Record<Tier, { label: string; color: string }> = {
  BRONZE: { label: "Bronze", color: "#cd8a52" },
  ARGENT: { label: "Argent", color: "#c9d3dd" },
  OR: { label: "Or", color: "#ffc23d" },
};

export type Stats = {
  packsOpened: number;
  uniqueCards: number;
  totalActiveCards: number;
  maxCopies: number;
  epicOwned: number;
  legendaryOwned: number;
  legendaryTotal: number;
  mythicOwned: number;
  recycled: number;
  duelWins: number;
  votes: number;
  anecdotes: number;
  shinyOwned: number;
  tradesDone: number;
  featuredIn: number;
  bestElementDone: number; // nb max de cartes possédées dans un élément complet ou non
  bestElementTarget: number; // taille de cet élément
  elementCompleted: boolean;
  luckyPack: boolean;
  /** Séries (3 cartes minimum) entièrement possédées */
  seriesCompleted: number;
  seriesTotal: number;
  eventOwned: number;
  altOwned: number;
  maxLevel: number;
  maxedCards: number;
  prestige: number;
  shinyComplete: boolean;
  podiums: number;
  championships: number;
  tournamentWins: number;
  tournamentsPlayed: number;
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  kanji: string;
  tier: Tier;
  /** [valeur actuelle, objectif] */
  progress: (s: Stats) => [number, number];
};

const pct = (s: Stats) => (s.totalActiveCards ? Math.floor((s.uniqueCards / s.totalActiveCards) * 100) : 0);

/** Ajoute, retire ou modifie des succès ici. Ne change pas l'`id` d'un succès existant. */
export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_pack", name: "Premier pas", description: "Ouvrir ton premier booster.", kanji: "初", tier: "BRONZE", progress: (s) => [s.packsOpened, 1] },
  { id: "packs_10", name: "Habitué du dojo", description: "Ouvrir 10 boosters.", kanji: "常", tier: "ARGENT", progress: (s) => [s.packsOpened, 10] },
  { id: "packs_50", name: "Vétéran", description: "Ouvrir 50 boosters.", kanji: "古", tier: "OR", progress: (s) => [s.packsOpened, 50] },
  { id: "unique_10", name: "Collectionneur", description: "Posséder 10 cartes différentes.", kanji: "集", tier: "BRONZE", progress: (s) => [s.uniqueCards, 10] },
  { id: "half", name: "Archiviste", description: "Compléter la moitié de la collection.", kanji: "半", tier: "ARGENT", progress: (s) => [pct(s), 50] },
  { id: "full", name: "Maître du clan", description: "Compléter toute la collection.", kanji: "全", tier: "OR", progress: (s) => [s.totalActiveCards ? pct(s) : 0, 100] },
  { id: "epic", name: "Premier éclat", description: "Obtenir une carte Épique.", kanji: "極", tier: "BRONZE", progress: (s) => [s.epicOwned, 1] },
  { id: "legendary", name: "Légende vivante", description: "Obtenir une carte Légendaire.", kanji: "伝", tier: "ARGENT", progress: (s) => [s.legendaryOwned, 1] },
  { id: "all_legendary", name: "Panthéon", description: "Posséder toutes les cartes Légendaires.", kanji: "殿", tier: "OR", progress: (s) => [s.legendaryOwned, Math.max(1, s.legendaryTotal)] },
  { id: "mythic", name: "Au-delà de la légende", description: "Obtenir une carte Mythique.", kanji: "神", tier: "OR", progress: (s) => [s.mythicOwned, 1] },
  { id: "lucky_pack", name: "Béni des étoiles", description: "Obtenir 2 cartes Épiques ou mieux dans un même booster.", kanji: "福", tier: "OR", progress: (s) => [s.luckyPack ? 1 : 0, 1] },
  { id: "shiny_1", name: "Éclat d'arc-en-ciel", description: "Obtenir une carte brillante.", kanji: "虹", tier: "ARGENT", progress: (s) => [s.shinyOwned, 1] },
  { id: "shiny_10", name: "Collection scintillante", description: "Posséder 10 cartes différentes en version brillante.", kanji: "輝", tier: "OR", progress: (s) => [s.shinyOwned, 10] },
  { id: "shiny_all", name: "Collection brillante", description: "Posséder toutes les cartes en version brillante.", kanji: "煌", tier: "OR", progress: (s) => [s.shinyComplete ? 1 : 0, 1] },
  { id: "prestige_1", name: "Renaissance", description: "Passer au prestige : compléter la collection et la remettre à zéro.", kanji: "輪", tier: "OR", progress: (s) => [s.prestige, 1] },
  { id: "prestige_3", name: "Éternel retour", description: "Atteindre le prestige 3.", kanji: "永", tier: "OR", progress: (s) => [s.prestige, 3] },
  { id: "dupes_5", name: "Écho", description: "Posséder 5 exemplaires d'une même carte.", kanji: "響", tier: "BRONZE", progress: (s) => [s.maxCopies, 5] },
  { id: "element", name: "Maître élémentaire", description: "Posséder toutes les cartes d'un élément (3 cartes minimum).", kanji: "元", tier: "ARGENT", progress: (s) => [s.elementCompleted ? s.bestElementTarget : s.bestElementDone, Math.max(3, s.bestElementTarget)] },
  { id: "recycle", name: "Rien ne se perd", description: "Recycler tes premiers doublons.", kanji: "環", tier: "BRONZE", progress: (s) => [s.recycled, 1] },
  { id: "trade_1", name: "Premier pacte", description: "Réaliser ton premier échange.", kanji: "縁", tier: "BRONZE", progress: (s) => [s.tradesDone, 1] },
  { id: "trade_10", name: "Marchand du quartier", description: "Réaliser 10 échanges.", kanji: "商", tier: "ARGENT", progress: (s) => [s.tradesDone, 10] },
  { id: "duel_1", name: "Premier sang", description: "Gagner un duel contre un membre.", kanji: "刃", tier: "BRONZE", progress: (s) => [s.duelWins, 1] },
  { id: "duel_25", name: "Gladiateur", description: "Gagner 25 duels contre des membres.", kanji: "闘", tier: "ARGENT", progress: (s) => [s.duelWins, 25] },
  { id: "season_podium", name: "Sur le podium", description: "Finir dans le top 3 d'une saison de duel.", kanji: "台", tier: "ARGENT", progress: (s) => [s.podiums, 1] },
  { id: "season_champion", name: "Champion du mois", description: "Finir premier d'une saison de duel.", kanji: "王", tier: "OR", progress: (s) => [s.championships, 1] },
  { id: "tournament_1", name: "Dans l'arène", description: "Participer à un tournoi.", kanji: "陣", tier: "BRONZE", progress: (s) => [s.tournamentsPlayed, 1] },
  { id: "tournament_win", name: "Vainqueur du tournoi", description: "Remporter un tournoi.", kanji: "冠", tier: "OR", progress: (s) => [s.tournamentWins, 1] },
  { id: "vote_1", name: "Voix du peuple", description: "Participer à un vote de la communauté.", kanji: "票", tier: "BRONZE", progress: (s) => [s.votes, 1] },
  { id: "story_1", name: "Conteur", description: "Voir une de tes anecdotes publiée dans un livre d'or.", kanji: "話", tier: "BRONZE", progress: (s) => [s.anecdotes, 1] },
  { id: "series_1", name: "Saison bouclée", description: "Compléter une série entière (3 cartes minimum).", kanji: "季", tier: "ARGENT", progress: (s) => [s.seriesCompleted, 1] },
  { id: "series_all", name: "Gardien des saisons", description: "Compléter toutes les séries (au moins 2).", kanji: "暦", tier: "OR", progress: (s) => [s.seriesTotal >= 2 ? s.seriesCompleted : 0, Math.max(2, s.seriesTotal)] },
  { id: "event_1", name: "Souvenir d'un soir", description: "Obtenir une carte d'événement.", kanji: "祭", tier: "BRONZE", progress: (s) => [s.eventOwned, 1] },
  { id: "event_5", name: "Toujours au rendez-vous", description: "Posséder 5 cartes d'événement différentes.", kanji: "宴", tier: "OR", progress: (s) => [s.eventOwned, 5] },
  { id: "alt_1", name: "Autre facette", description: "Obtenir une version alternative.", kanji: "貌", tier: "ARGENT", progress: (s) => [s.altOwned, 1] },
  { id: "evolve_1", name: "Éveil", description: "Faire évoluer une carte.", kanji: "覚", tier: "BRONZE", progress: (s) => [s.maxLevel >= 2 ? 1 : 0, 1] },
  { id: "evolve_max", name: "Forme ultime", description: "Amener une carte au niveau ★5.", kanji: "昇", tier: "OR", progress: (s) => [s.maxLevel, 5] },
  { id: "evolve_5max", name: "Maître forgeron", description: "Posséder 5 cartes au niveau ★5.", kanji: "鍛", tier: "OR", progress: (s) => [s.maxedCards, 5] },
  { id: "featured", name: "Visage du clan", description: "Apparaître sur une carte.", kanji: "顔", tier: "BRONZE", progress: (s) => [s.featuredIn, 1] },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export type BadgeView = Pick<Achievement, "id" | "name" | "description" | "kanji" | "tier">;

export function badgeView(id: string | null | undefined): BadgeView | null {
  const a = id ? ACHIEVEMENT_BY_ID.get(id) : undefined;
  return a ? { id: a.id, name: a.name, description: a.description, kanji: a.kanji, tier: a.tier } : null;
}
