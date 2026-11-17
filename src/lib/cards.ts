import type { Card, User } from "@prisma/client";
import type { CardView } from "@/lib/game";

/** Image d'une carte : image dédiée, sinon avatar Discord du membre représenté. */
export function toCardView(card: Card & { subject?: Pick<User, "image" | "consent"> | null }): CardView {
  // Si le membre représenté retire son accord, aucune image de lui n'est affichée.
  const revoked = card.subject != null && !card.subject.consent;
  const image = revoked ? null : card.imageUrl || card.subject?.image || null;
  return {
    id: card.id,
    number: card.number,
    name: card.name,
    title: card.title,
    description: card.description,
    rarity: card.rarity,
    element: card.element,
    attack: card.attack,
    defense: card.defense,
    imageUrl: image,
  };
}
