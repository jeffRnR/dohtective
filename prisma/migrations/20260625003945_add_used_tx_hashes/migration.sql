-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "usedTxHashes" TEXT[] DEFAULT ARRAY[]::TEXT[];
