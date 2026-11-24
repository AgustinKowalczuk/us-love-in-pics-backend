-- Ensure each user belongs to only one active board.
CREATE UNIQUE INDEX "board_members_one_active_per_user"
ON "board_members" ("user_id")
WHERE "status" = 'ACTIVE';
