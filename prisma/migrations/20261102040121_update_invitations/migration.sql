/*
  Warnings:

  - You are about to alter the column `token_hash` on the `invitations` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(64)`.
  - Added the required column `token_encrypted` to the `invitations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `invitations` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "responded_at" TIMESTAMP(3),
ADD COLUMN     "token_encrypted" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "token_hash" SET DATA TYPE VARCHAR(64);

-- CreateIndex
CREATE INDEX "invitations_expires_at_status_idx" ON "invitations"("expires_at", "status");

-- Ensure one pending invitation per sender.
CREATE UNIQUE INDEX "invitations_one_pending_per_sender"
ON "invitations" ("sender_id")
WHERE "status" = 'PENDING';