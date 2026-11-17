-- CreateEnum
CREATE TYPE "DuelResult" AS ENUM ('ATTACKER', 'DEFENDER', 'DRAW');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "defenseTeam" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "duelLosses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "duelWins" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Duel" (
    "id" TEXT NOT NULL,
    "attackerId" TEXT NOT NULL,
    "defenderId" TEXT,
    "result" "DuelResult" NOT NULL,
    "log" JSONB NOT NULL,
    "rewarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Duel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Duel_attackerId_createdAt_idx" ON "Duel"("attackerId", "createdAt");

-- CreateIndex
CREATE INDEX "Duel_defenderId_createdAt_idx" ON "Duel"("defenderId", "createdAt");

-- AddForeignKey
ALTER TABLE "Duel" ADD CONSTRAINT "Duel_attackerId_fkey" FOREIGN KEY ("attackerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Duel" ADD CONSTRAINT "Duel_defenderId_fkey" FOREIGN KEY ("defenderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
