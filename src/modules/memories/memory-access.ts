
import type { Prisma } from "../../generated/prisma/client.js";

/**
 * Locks a board row to serialize operations affecting its contents.
 */
export async function lockBoard(
  tx: Prisma.TransactionClient,
  boardId: string,
  mode: "SHARE" | "UPDATE",
): Promise<void> {
  if (mode === "UPDATE") {
    await tx.$queryRaw`
      SELECT id
      FROM boards
      WHERE id = ${boardId}::uuid
      FOR UPDATE
    `;

    return;
  }

  await tx.$queryRaw`
    SELECT id
    FROM boards
    WHERE id = ${boardId}::uuid
    FOR SHARE
  `;
}

/**
 * Validates that a board exists, is active, and belongs to the user.
 */
export async function validateBoardAccess(
  tx: Prisma.TransactionClient,
  userId: string,
  boardId: string,
): Promise<void> {
  const board = await tx.board.findUnique({
    where: { id: boardId },
    select: { id: true, status: true },
  });

  if (!board || board.status !== "ACTIVE") {
    throw new Error("BOARD_NOT_FOUND");
  }

  const membership = await tx.boardMember.findFirst({
    where: {
      boardId,
      userId,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (!membership) {
    throw new Error("NOT_BOARD_MEMBER");
  }
}
