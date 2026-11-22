-- CreateTable
CREATE TABLE "WeeklyProgress" (
    "userId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "packs" INTEGER NOT NULL DEFAULT 0,
    "duelWins" INTEGER NOT NULL DEFAULT 0,
    "duels" INTEGER NOT NULL DEFAULT 0,
    "trades" INTEGER NOT NULL DEFAULT 0,
    "evolutions" INTEGER NOT NULL DEFAULT 0,
    "recycled" INTEGER NOT NULL DEFAULT 0,
    "anecdotes" INTEGER NOT NULL DEFAULT 0,
    "claimed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyProgress_pkey" PRIMARY KEY ("userId","week")
);

-- AddForeignKey
ALTER TABLE "WeeklyProgress" ADD CONSTRAINT "WeeklyProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

