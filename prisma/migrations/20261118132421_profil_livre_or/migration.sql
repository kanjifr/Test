-- CreateEnum
CREATE TYPE "AnecdoteStatus" AS ENUM ('PENDING', 'APPROVED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "showcase" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Anecdote" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "authorId" TEXT,
    "text" TEXT NOT NULL,
    "status" "AnecdoteStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Anecdote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Anecdote_cardId_status_idx" ON "Anecdote"("cardId", "status");

-- CreateIndex
CREATE INDEX "Anecdote_status_createdAt_idx" ON "Anecdote"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Anecdote" ADD CONSTRAINT "Anecdote_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anecdote" ADD CONSTRAINT "Anecdote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anecdote" ADD CONSTRAINT "Anecdote_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
