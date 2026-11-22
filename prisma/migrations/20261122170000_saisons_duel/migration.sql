-- CreateTable
CREATE TABLE "SeasonAward" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeasonAward_userId_idx" ON "SeasonAward"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonAward_kind_period_rank_key" ON "SeasonAward"("kind", "period", "rank");

-- AddForeignKey
ALTER TABLE "SeasonAward" ADD CONSTRAINT "SeasonAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

