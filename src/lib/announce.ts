import { ELEMENTS, RARITIES, RARITY_ORDER, SITE_NAME, type CardView } from "@/lib/game";
import { isWebhook, mention, publicImage, siteUrl } from "@/lib/discord";
import { getAnnounceSettings } from "@/lib/settings";

type Person = { discordId?: string | null; name?: string | null };
type Embed = Record<string, unknown>;
export type AnnouncePayload = { content?: string; embeds?: Embed[] };

/** Délai avant publication : le joueur a le temps de découvrir ses cartes sans être spoilé. */
export const ANNOUNCE_DELAY_MS = 20_000;

export const announceConfigured = () => isWebhook(process.env.ANNOUNCE_DISCORD_WEBHOOK_URL);

const hex = (c: string) => Number.parseInt(c.replace("#", ""), 16);

export async function postAnnouncement(payload: AnnouncePayload) {
  const url = process.env.ANNOUNCE_DISCORD_WEBHOOK_URL;
  if (!isWebhook(url)) throw new Error("ANNOUNCE_DISCORD_WEBHOOK_URL n'est pas configurée.");
  const res = await fetch(url!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Les mentions s'affichent (@pseudo) mais ne notifient personne
    body: JSON.stringify({ ...payload, username: SITE_NAME, allowed_mentions: { parse: [] } }),
  });
  if (!res.ok) throw new Error(`Discord a refusé l'annonce (${res.status}).`);
}

/** Publie plus tard, sans jamais bloquer ni faire échouer l'action du joueur. */
function later(payload: AnnouncePayload | null, delay = ANNOUNCE_DELAY_MS) {
  if (!payload || !announceConfigured()) return;
  setTimeout(() => {
    postAnnouncement(payload).catch((e) => console.error("[annonce]", (e as Error).message));
  }, delay);
}

// --- Construction des messages (sans effet de bord) ---

export function pullMessage(user: Person, cards: CardView[]): AnnouncePayload | null {
  if (cards.length === 0) return null;
  const best = [...cards].sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity));
  const top = best[0];
  const intro =
    top.rarity === "MYTHIQUE"
      ? "🔥🔥 **MYTHIQUE !**"
      : top.rarity === "LEGENDAIRE"
        ? "✨ **Légendaire !**"
        : top.rarity === "EPIQUE"
          ? "💜 **Épique !**"
          : "🌈 **Brillante !**";
  const names = best.map((c) => `**${c.name}**${c.shiny ? " ✦ brillante" : ""}`).join(", ");
  return {
    content: `${intro} ${mention(user)} vient d'obtenir ${names} !`,
    embeds: best.slice(0, 10).map((c) => ({
      title: `#${String(c.number).padStart(3, "0")} · ${c.name}${c.shiny ? " ✦ BRILLANTE" : ""}`,
      description: [c.title && `*${c.title}*`, c.description].filter(Boolean).join("\n") || undefined,
      color: hex(RARITIES[c.rarity].color),
      fields: [
        { name: "Rareté", value: RARITIES[c.rarity].label, inline: true },
        { name: "Élément", value: `${ELEMENTS[c.element].kanji} ${ELEMENTS[c.element].label}`, inline: true },
        { name: "ATK / DEF", value: `${c.attack} / ${c.defense}`, inline: true },
      ],
      ...(publicImage(c.imageUrl) ? { thumbnail: { url: publicImage(c.imageUrl) } } : {}),
      ...(siteUrl() ? { url: siteUrl("/collection") } : {}),
    })),
  };
}

export function duelMessage(winner: Person, loser: Person, score: [number, number], duelId: string): AnnouncePayload {
  const link = siteUrl(`/duels/${duelId}`);
  return {
    content: `⚔ ${mention(winner)} a battu ${mention(loser)} en duel (**${Math.max(...score)} – ${Math.min(...score)}**) !${link ? ` [Revoir le combat](${link})` : ""}`,
  };
}

export function tradeMessage(a: Person, b: Person, aGives: string[], bGives: string[]): AnnouncePayload {
  return {
    content: `🤝 ${mention(a)} et ${mention(b)} ont conclu un échange : ${aGives.join(", ")} ⇄ ${bGives.join(", ")}`,
  };
}

// --- Déclencheurs appelés par le jeu ---

export async function announcePull(user: Person, cards: CardView[]) {
  if (!announceConfigured()) return;
  const { pulls } = await getAnnounceSettings();
  if (pulls === "OFF") return;
  const min = RARITY_ORDER.indexOf(pulls);
  // Les brillantes sont toujours annoncées, même Communes
  later(pullMessage(user, cards.filter((c) => c.shiny || RARITY_ORDER.indexOf(c.rarity) >= min)));
}

export async function announceDuel(winner: Person, loser: Person, score: [number, number], duelId: string) {
  if (!announceConfigured() || !(await getAnnounceSettings()).duels) return;
  later(duelMessage(winner, loser, score, duelId));
}

export async function announceTrade(a: Person, b: Person, aGives: string[], bGives: string[]) {
  if (!announceConfigured() || !(await getAnnounceSettings()).trades) return;
  later(tradeMessage(a, b, aGives, bGives), 1_000);
}

export async function announcePoll(question: string, closesAt: Date) {
  if (!announceConfigured() || !(await getAnnounceSettings()).polls) return;
  const end = closesAt.toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const link = siteUrl("/votes");
  later({ content: `🗳️ **Nouveau vote :** ${question}\nRéponds avant ${end}${link ? ` : ${link}` : " !"}` }, 1_000);
}

export async function announcePollResult(question: string, winners: string[], total: number) {
  if (!announceConfigured() || !(await getAnnounceSettings()).polls) return;
  const text =
    winners.length === 0
      ? "personne n'a voté."
      : winners.length === 1
        ? `**${winners[0]}** l'emporte !`
        : `égalité entre ${winners.map((w) => `**${w}**`).join(" et ")} !`;
  later({ content: `🗳️ **Résultat du vote** « ${question} » : ${text} (${total} vote${total > 1 ? "s" : ""})` }, 1_000);
}

export async function announceBirthday(people: Person[]) {
  if (!announceConfigured() || people.length === 0 || !(await getAnnounceSettings()).birthdays) return;
  const names = people.map(mention).join(" et ");
  const link = siteUrl("/");
  await postAnnouncement({
    content: `🎂 Joyeux anniversaire ${names} ! Aujourd'hui, ${people.length > 1 ? "leurs cartes sortent" : "sa carte sort"} 5 fois plus souvent dans les boosters. À vous de la trouver !${link ? ` ${link}` : ""}`,
  });
}

/** Annonce décidée par le staff (case « Annoncer sur Discord ») : pas de réglage à vérifier. */
export async function announceText(content: string) {
  if (!announceConfigured()) return;
  later({ content }, 1_000);
}

export async function announceSeries(name: string, count: number) {
  const link = siteUrl("/");
  await announceText(`🌸 **Nouvelle série : ${name} !** ${count} nouvelle${count > 1 ? "s" : ""} carte${count > 1 ? "s" : ""} à découvrir dans les boosters.${link ? ` ${link}` : ""}`);
}
