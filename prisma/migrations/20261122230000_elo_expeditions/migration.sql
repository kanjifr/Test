-- AlterTable
ALTER TABLE "Duel" ADD COLUMN     "attackerDelta" INTEGER,
ADD COLUMN     "defenderDelta" INTEGER;

-- AlterTable
ALTER TABLE "WeeklyProgress" ADD COLUMN     "expeditions" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Expedition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "cardIds" TEXT[],
    "hours" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reward" JSONB NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "notified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Expedition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expedition_userId_claimedAt_idx" ON "Expedition"("userId", "claimedAt");

-- CreateIndex
CREATE INDEX "Expedition_endsAt_notified_idx" ON "Expedition"("endsAt", "notified");

-- AddForeignKey
ALTER TABLE "Expedition" ADD CONSTRAINT "Expedition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

