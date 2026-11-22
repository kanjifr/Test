import type { Element, Rarity } from "@prisma/client";
import { ELEMENTS, ELEMENT_KEYS, RARITIES, RARITY_ORDER } from "@/lib/game";
import { norm, parseCsv } from "@/lib/csv";

export const MAX_IMPORT_ROWS = 500;

/** Noms de colonnes acceptés (sans accents, en minuscules). */
const COLUMNS: Record<string, string[]> = {
  name: ["nom", "name", "pseudo", "carte"],
  title: ["titre", "title", "surnom"],
  description: ["description", "desc"],
  rarity: ["rarete", "rarity"],
  element: ["element", "type"],
  attack: ["attaque", "atk", "attack"],
  defense: ["defense", "def"],
  image: ["image", "img", "photo"],
  video: ["video"],
  member: ["membre", "member", "discord", "id discord"],
  series: ["serie", "series", "saison"],
  event: ["evenement", "event"],
  from: ["debut", "du", "from", "date debut"],
  until: ["fin", "au", "until", "date fin"],
  variantOf: ["alternative de", "alternative_de", "alternative", "variante de", "variante"],
};

const RARITY_ALIASES: Record<string, Rarity> = Object.fromEntries(
  RARITY_ORDER.flatMap((r) => [
    [norm(r), r],
    [norm(RARITIES[r].label), r],
  ]),
);
RARITY_ALIASES["legendary"] = "LEGENDAIRE";
RARITY_ALIASES["epic"] = "EPIQUE";
RARITY_ALIASES["common"] = "COMMUNE";
RARITY_ALIASES["mythic"] = "MYTHIQUE";

const ELEMENT_ALIASES: Record<string, Element> = Object.fromEntries(
  ELEMENT_KEYS.flatMap((e) => [
    [norm(e), e],
    [norm(ELEMENTS[e].label), e],
    [ELEMENTS[e].kanji, e],
  ]),
);
ELEMENT_ALIASES["feu"] = "FLAMME";
ELEMENT_ALIASES["eclair"] = "FOUDRE";
ELEMENT_ALIASES["roche"] = "PIERRE";
ELEMENT_ALIASES["terre"] = "PIERRE";

export type ImportRow = {
  line: number;
  name: string;
  title: string;
  description: string;
  rarity: Rarity | null;
  element: Element | null;
  attack: number;
  defense: number;
  image: string;
  video: string;
  member: string;
  /** undefined quand la colonne est absente du tableau (on ne touche pas à la valeur existante) */
  series?: string;
  event?: string;
  from?: string | null;
  until?: string | null;
  variantOf?: string;
  errors: string[];
};

/** Date « JJ/MM/AAAA » ou « AAAA-MM-JJ » → « AAAA-MM-JJ ». null si vide, "" si invalide. */
function readDate(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

function stat(v: string | undefined, label: string, errors: string[]) {
  if (!v?.trim()) return 50;
  const n = Number.parseInt(v.trim(), 10);
  if (Number.isNaN(n) || n < 0 || n > 999) {
    errors.push(`${label} doit être un nombre entre 0 et 999`);
    return 50;
  }
  return n;
}

/** Lit le tableau et vérifie chaque ligne. Ne touche pas à la base de données. */
export function readImportTable(text: string): { rows: ImportRow[]; error?: string } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: "Le fichier est vide ou ne contient que la ligne d'en-têtes." };
  const header = table[0].map(norm);
  const col: Partial<Record<keyof typeof COLUMNS, number>> = {};
  for (const [key, names] of Object.entries(COLUMNS)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0) col[key as keyof typeof COLUMNS] = i;
  }
  const missing = (["name", "rarity", "element"] as const).filter((k) => col[k] === undefined);
  if (missing.length) {
    const labels = { name: "nom", rarity: "rarete", element: "element" };
    return { rows: [], error: `Colonne(s) obligatoire(s) introuvable(s) : ${missing.map((m) => labels[m]).join(", ")}.` };
  }
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    return { rows: [], error: `${MAX_IMPORT_ROWS} cartes maximum par import (le fichier en contient ${table.length - 1}).` };
  }
  const get = (r: string[], k: keyof typeof COLUMNS) => (col[k] === undefined ? "" : (r[col[k]!] ?? "").trim());
  const opt = (r: string[], k: keyof typeof COLUMNS) => (col[k] === undefined ? undefined : get(r, k));

  const rows = table.slice(1).map((r, i): ImportRow => {
    const errors: string[] = [];
    const name = get(r, "name").slice(0, 40);
    if (!name) errors.push("nom manquant");
    const rawRarity = get(r, "rarity");
    const rarity = RARITY_ALIASES[norm(rawRarity)] ?? null;
    if (!rarity) errors.push(`rareté inconnue « ${rawRarity} »`);
    const rawElement = get(r, "element");
    const element = ELEMENT_ALIASES[norm(rawElement)] ?? ELEMENT_ALIASES[rawElement] ?? null;
    if (!element) errors.push(`élément inconnu « ${rawElement} »`);
    const video = get(r, "video");
    if (video && rarity && rarity !== "MYTHIQUE") errors.push("une vidéo n'est possible que pour une Mythique");
    const rawFrom = opt(r, "from");
    const rawUntil = opt(r, "until");
    const from = rawFrom === undefined ? undefined : readDate(rawFrom);
    const until = rawUntil === undefined ? undefined : readDate(rawUntil);
    if (from === "") errors.push(`date de début « ${rawFrom} » illisible (format JJ/MM/AAAA)`);
    if (until === "") errors.push(`date de fin « ${rawUntil} » illisible (format JJ/MM/AAAA)`);
    if (from && until && from > until) errors.push("la date de début est après la date de fin");
    return {
      line: i + 2,
      name,
      title: get(r, "title").slice(0, 40),
      description: get(r, "description").slice(0, 300),
      rarity,
      element,
      attack: stat(get(r, "attack"), "attaque", errors),
      defense: stat(get(r, "defense"), "défense", errors),
      image: get(r, "image"),
      video,
      member: get(r, "member"),
      series: opt(r, "series"),
      event: opt(r, "event")?.slice(0, 30),
      from,
      until,
      variantOf: opt(r, "variantOf"),
      errors,
    };
  });
  return { rows };
}

export const TEMPLATE_CSV = [
  "nom;titre;description;rarete;element;attaque;defense;image;video;membre;serie;evenement;debut;fin;alternative_de",
  "Akane;La lame du matin;Toujours la première levée.;Commune;Flamme;42;30;akane.png;;;Saison 1;;;;",
  "Kaito;Flot implacable;;Rare;Eau;61;52;https://exemple.com/kaito.jpg;;;Saison 1;;;;",
  "Kuro;L'éveil du dragon;Personne ne l'a vu deux fois.;Mythique;Ombre;120;110;kuro.png;kuro.mp4;123456789012345678;Saison 1;;;;",
  "Akane citrouille;Nuit des lanternes;;Épique;Flamme;55;40;akane-halloween.png;;;Saison 1;Halloween;25/10/2026;02/11/2026;Akane",
].join("\r\n");
