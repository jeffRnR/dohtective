/*
  Warnings:

  - You are about to drop the column `token` on the `EmailVerification` table. All the data in the column will be lost.
  - Added the required column `tokenHash` to the `EmailVerification` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EmailVerification" DROP COLUMN "token",
ADD COLUMN     "tokenHash" TEXT NOT NULL;
