-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "availableFrom" TIMESTAMP(3),
ADD COLUMN     "availableUntil" TIMESTAMP(3),
ADD COLUMN     "eventName" TEXT,
ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "variantOfId" TEXT;

-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "inBoosters" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_variantOfId_fkey" FOREIGN KEY ("variantOfId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Toutes les cartes existantes forment la Saison 1
INSERT INTO "Series" ("id", "name", "description", "inBoosters") VALUES ('saison-1', 'Saison 1', 'Les toutes premières cartes du clan.', true);
UPDATE "Card" SET "seriesId" = 'saison-1';
