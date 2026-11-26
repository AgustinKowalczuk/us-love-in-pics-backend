/*
  Warnings:

  - You are about to drop the column `text` on the `memories` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `memories` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[board_id,position]` on the table `memories` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[memory_id,position]` on the table `memory_media` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `memory_date` to the `memories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `position` to the `memories` table without a default value. This is not possible if the table is not empty.

*/

-- Remove development and test memories before changing their structure.
TRUNCATE TABLE "memory_media", "memories";

-- DropIndex
DROP INDEX "memories_board_id_created_at_idx";

-- DropIndex
DROP INDEX "memory_media_memory_id_position_idx";

-- AlterTable
ALTER TABLE "memories" DROP COLUMN "text",
DROP COLUMN "type",
ADD COLUMN     "memory_date" DATE NOT NULL,
ADD COLUMN     "position" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "memory_media" ADD COLUMN     "description" VARCHAR(500),
ADD COLUMN     "taken_at" DATE,
ALTER COLUMN "position" DROP DEFAULT;

-- DropEnum
DROP TYPE "MemoryType";

-- CreateTable
CREATE TABLE "memory_notes" (
    "id" UUID NOT NULL,
    "memory_id" UUID NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "memory_notes_memory_id_position_key" ON "memory_notes"("memory_id", "position");

-- CreateIndex
CREATE INDEX "memories_board_id_memory_date_idx" ON "memories"("board_id", "memory_date");

-- CreateIndex
CREATE UNIQUE INDEX "memories_board_id_position_key" ON "memories"("board_id", "position");

-- CreateIndex
CREATE INDEX "memory_media_memory_id_media_type_idx" ON "memory_media"("memory_id", "media_type");

-- CreateIndex
CREATE UNIQUE INDEX "memory_media_memory_id_position_key" ON "memory_media"("memory_id", "position");

-- AddForeignKey
ALTER TABLE "memory_notes" ADD CONSTRAINT "memory_notes_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict memory pins to the 13 available board positions.
ALTER TABLE "memories"
ADD CONSTRAINT "memories_position_range"
CHECK ("position" BETWEEN 1 AND 13);

-- Require positive positions for media and notes.
ALTER TABLE "memory_media"
ADD CONSTRAINT "memory_media_position_positive"
CHECK ("position" >= 1);

ALTER TABLE "memory_notes"
ADD CONSTRAINT "memory_notes_position_positive"
CHECK ("position" >= 1);