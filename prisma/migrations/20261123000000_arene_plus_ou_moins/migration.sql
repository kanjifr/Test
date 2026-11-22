-- AlterTable
ALTER TABLE "WeeklyProgress" ADD COLUMN     "arenaWins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "highlow" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ArenaRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "picks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "offer" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "lastLog" JSONB,
    "lastNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reward" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ArenaRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HighLowRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "rewarded" BOOLEAN NOT NULL DEFAULT false,
    "deck" TEXT[],
    "index" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "HighLowRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArenaRun_userId_createdAt_idx" ON "ArenaRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ArenaRun_status_endedAt_idx" ON "ArenaRun"("status", "endedAt");

-- CreateIndex
CREATE INDEX "HighLowRun_userId_day_idx" ON "HighLowRun"("userId", "day");

-- CreateIndex
CREATE INDEX "HighLowRun_day_streak_idx" ON "HighLowRun"("day", "streak");

-- AddForeignKey
ALTER TABLE "ArenaRun" ADD CONSTRAINT "ArenaRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HighLowRun" ADD CONSTRAINT "HighLowRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

