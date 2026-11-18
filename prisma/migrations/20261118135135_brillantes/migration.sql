-- DropIndex
DROP INDEX "TradeItem_tradeId_side_cardId_key";

-- AlterTable
ALTER TABLE "Pull" ADD COLUMN     "shiny" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TradeItem" ADD COLUMN     "shiny" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserCard" ADD COLUMN     "shiny" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "TradeItem_tradeId_side_cardId_shiny_key" ON "TradeItem"("tradeId", "side", "cardId", "shiny");

