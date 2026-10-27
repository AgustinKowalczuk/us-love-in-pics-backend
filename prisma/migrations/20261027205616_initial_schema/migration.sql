-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BoardStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BoardMemberRole" AS ENUM ('OWNER', 'PARTNER');

-- CreateEnum
CREATE TYPE "BoardMemberStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('NOTE', 'PHOTO', 'GIF');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('PHOTO', 'GIF');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "recipient_id" UUID,
    "recipient_email" VARCHAR(255) NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boards" (
    "id" UUID NOT NULL,
    "name" VARCHAR(201) NOT NULL,
    "status" "BoardStatus" NOT NULL DEFAULT 'ACTIVE',
    "photo_limit" INTEGER NOT NULL DEFAULT 15,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_members" (
    "id" UUID NOT NULL,
    "board_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "BoardMemberRole" NOT NULL,
    "status" "BoardMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "board_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" UUID NOT NULL,
    "board_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "type" "MemoryType" NOT NULL,
    "text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_media" (
    "id" UUID NOT NULL,
    "memory_id" UUID NOT NULL,
    "media_type" "MediaType" NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_sender_id_status_idx" ON "invitations"("sender_id", "status");

-- CreateIndex
CREATE INDEX "invitations_recipient_email_status_idx" ON "invitations"("recipient_email", "status");

-- CreateIndex
CREATE INDEX "boards_status_created_at_idx" ON "boards"("status", "created_at");

-- CreateIndex
CREATE INDEX "board_members_user_id_status_idx" ON "board_members"("user_id", "status");

-- CreateIndex
CREATE INDEX "board_members_board_id_status_idx" ON "board_members"("board_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "board_members_board_id_user_id_key" ON "board_members"("board_id", "user_id");

-- CreateIndex
CREATE INDEX "memories_board_id_created_at_idx" ON "memories"("board_id", "created_at");

-- CreateIndex
CREATE INDEX "memories_author_id_idx" ON "memories"("author_id");

-- CreateIndex
CREATE INDEX "memory_media_memory_id_position_idx" ON "memory_media"("memory_id", "position");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_media" ADD CONSTRAINT "memory_media_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
