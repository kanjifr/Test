import type { Element, Rarity } from "@prisma/client";

type Demo = { name: string; title: string; description: string; rarity: Rarity; element: Element; attack: number; defense: number };

/** Cartes d'exemple pour tester le site. Supprime-les ou remplace-les par tes membres. */
export const DEMO_CARDS: Demo[] = [
  { name: "Akane", title: "La lame du matin", description: "Se lève avant tout le monde, et ça se voit.", rarity: "COMMUNE", element: "FLAMME", attack: 42, defense: 30 },
  { name: "Ren", title: "Pas de côté", description: "Toujours là où on ne l'attend pas.", rarity: "COMMUNE", element: "VENT", attack: 35, defense: 38 },
  { name: "Mio", title: "Gardienne du salon", description: "Rien n'échappe à sa vigilance.", rarity: "COMMUNE", element: "PIERRE", attack: 28, defense: 55 },
  { name: "Haru", title: "Rire en tempête", description: "Son rire résonne dans tous les vocaux.", rarity: "COMMUNE", element: "FOUDRE", attack: 47, defense: 25 },
  { name: "Sora", title: "Regard d'horizon", description: "Contemple, puis frappe.", rarity: "COMMUNE", element: "BRUME", attack: 33, defense: 41 },
  { name: "Yuki", title: "Neige silencieuse", description: "Calme en apparence. En apparence.", rarity: "COMMUNE", element: "EAU", attack: 38, defense: 40 },
  { name: "Kaito", title: "Flot implacable", description: "Avance comme la marée montante.", rarity: "RARE", element: "EAU", attack: 61, defense: 52 },
  { name: "Hana", title: "Pétale tranchant", description: "Douce comme une fleur, vive comme une lame.", rarity: "RARE", element: "FLEUR", attack: 64, defense: 48 },
  { name: "Daichi", title: "Roc inébranlable", description: "Personne ne l'a jamais vu reculer.", rarity: "RARE", element: "PIERRE", attack: 55, defense: 70 },
  { name: "Rin", title: "Éclair furtif", description: "Déjà partie avant que tu la voies.", rarity: "EPIQUE", element: "FOUDRE", attack: 82, defense: 58 },
  { name: "Kage", title: "Celui qui veille", description: "Il ne dort jamais. Vraiment jamais.", rarity: "EPIQUE", element: "OMBRE", attack: 78, defense: 66 },
  { name: "Tsubasa", title: "Fondatrice du clan", description: "Là depuis le tout premier jour.", rarity: "LEGENDAIRE", element: "FLAMME", attack: 95, defense: 88 },
];
