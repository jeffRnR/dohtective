-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "analysisCredits" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "lifetimeCreditsUsed" INTEGER NOT NULL DEFAULT 0;
