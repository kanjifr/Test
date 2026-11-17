-- AlterEnum
ALTER TYPE "Rarity" ADD VALUE 'MYTHIQUE';

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "videoUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pityCount" INTEGER NOT NULL DEFAULT 0;
