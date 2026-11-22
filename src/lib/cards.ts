import type { Card, User } from "@prisma/client";
import type { CardView } from "@/lib/game";
import { isBirthdayToday } from "@/lib/birthday";

type Subject = Pick<User, "image" | "consent"> & Partial<Pick<User, "birthMonth" | "birthDay">>;

/** Image d'une carte : image dédiée, sinon avatar Discord du membre représenté. */
export function toCardView(card: Card & { subject?: Subject | null }): CardView {
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
    videoUrl: revoked || card.rarity !== "MYTHIQUE" ? null : card.videoUrl || null,
    birthday: !revoked && isBirthdayToday(card.subject?.birthMonth, card.subject?.birthDay),
    event: card.eventName || null,
    alt: !!card.variantOfId,
  };
}
