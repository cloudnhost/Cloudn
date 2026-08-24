/*
  Warnings:

  - A unique constraint covering the columns `[sftpUsername]` on the table `Server` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "NodeStatus" ADD VALUE 'MAINTENANCE';

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'BANNED';

-- AlterTable
ALTER TABLE "Egg" ADD COLUMN     "installImage" TEXT,
ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Node" ADD COLUMN     "isEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maintenanceReason" TEXT;

-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "sftpPasswordHash" TEXT,
ADD COLUMN     "sftpPasswordSetAt" TIMESTAMP(3),
ADD COLUMN     "sftpUsername" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Server_sftpUsername_key" ON "Server"("sftpUsername");
