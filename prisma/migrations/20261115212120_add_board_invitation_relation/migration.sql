/*
  Warnings:

  - A unique constraint covering the columns `[invitation_id]` on the table `boards` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "boards" ADD COLUMN     "invitation_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "boards_invitation_id_key" ON "boards"("invitation_id");

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
