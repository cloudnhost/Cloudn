/*
  Warnings:

  - You are about to drop the column `secretHash` on the `NodeCredential` table. All the data in the column will be lost.
  - You are about to drop the column `isOverride` on the `Server` table. All the data in the column will be lost.
  - Added the required column `secretCiphertext` to the `NodeCredential` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "NodeCredential" DROP COLUMN "secretHash",
ADD COLUMN     "secretCiphertext" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Server" DROP COLUMN "isOverride",
ADD COLUMN     "countsAgainstPlan" BOOLEAN NOT NULL DEFAULT true;
