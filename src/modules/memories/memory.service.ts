
import { prisma } from "../../config/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  lockBoard,
  validateBoardAccess,
} from "./memory-access.js";

interface CreateMemoryData {
  boardId: string;
  memoryDate: string;
  position: number;
}

interface UpdateMemoryData {
  memoryDate?: string;
  position?: number;
}

/**
 * Checks whether a Prisma error represents a unique constraint violation.
 */
function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

/**
 * Converts a date-only string into a UTC date value.
 */
function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Creates a memory pin after validating board access.
 */
export async function createMemory(
  userId: string,
  data: CreateMemoryData,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockBoard(tx, data.boardId, "UPDATE");
      await validateBoardAccess(tx, userId, data.boardId);

      return tx.memory.create({
        data: {
          boardId: data.boardId,
          authorId: userId,
          memoryDate: toDateOnly(data.memoryDate),
          position: data.position,
        },
        include: {
          author: true,
          media: {
            orderBy: { position: "asc" },
          },
          notes: {
            orderBy: { position: "asc" },
          },
        },
      });
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new Error("MEMORY_POSITION_TAKEN");
    }

    throw error;
  }
}

/**
 * Retrieves all memory pins belonging to a board.
 */
export async function getMemories(userId: string, boardId: string) {
  return prisma.$transaction(async (tx) => {
    await lockBoard(tx, boardId, "SHARE");
    await validateBoardAccess(tx, userId, boardId);

    return tx.memory.findMany({
      where: { boardId },
      orderBy: [
        { memoryDate: "asc" },
        { position: "asc" },
      ],
      include: {
        author: true,
        media: {
          orderBy: { position: "asc" },
        },
        notes: {
          orderBy: { position: "asc" },
        },
      },
    });
  });
}

/**
 * Retrieves a memory pin after validating board access.
 */
export async function getMemoryById(
  userId: string,
  memoryId: string,
) {
  return prisma.$transaction(async (tx) => {
    const memory = await tx.memory.findUnique({
      where: { id: memoryId },
      select: { boardId: true },
    });

    if (!memory) {
      throw new Error("MEMORY_NOT_FOUND");
    }

    await lockBoard(tx, memory.boardId, "SHARE");
    await validateBoardAccess(tx, userId, memory.boardId);

    const result = await tx.memory.findUnique({
      where: { id: memoryId },
      include: {
        author: true,
        media: {
          orderBy: { position: "asc" },
        },
        notes: {
          orderBy: { position: "asc" },
        },
      },
    });

    if (!result) {
      throw new Error("MEMORY_NOT_FOUND");
    }

    return result;
  });
}

/**
 * Updates a memory pin's date and/or timeline position.
 */
export async function updateMemory(
  userId: string,
  memoryId: string,
  data: UpdateMemoryData,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const memory = await tx.memory.findUnique({
        where: { id: memoryId },
        select: { boardId: true },
      });

      if (!memory) {
        throw new Error("MEMORY_NOT_FOUND");
      }

      await lockBoard(tx, memory.boardId, "UPDATE");
      await validateBoardAccess(tx, userId, memory.boardId);

      return tx.memory.update({
        where: { id: memoryId },
        data: {
          ...(data.memoryDate !== undefined && {
            memoryDate: toDateOnly(data.memoryDate),
          }),
          ...(data.position !== undefined && {
            position: data.position,
          }),
        },
        include: {
          author: true,
          media: {
            orderBy: { position: "asc" },
          },
          notes: {
            orderBy: { position: "asc" },
          },
        },
      });
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new Error("MEMORY_POSITION_TAKEN");
    }

    throw error;
  }
}

/**
 * Deletes a memory pin and its related media and notes metadata.
 */
export async function deleteMemory(
  userId: string,
  memoryId: string,
) {
  return prisma.$transaction(async (tx) => {
    const memory = await tx.memory.findUnique({
      where: { id: memoryId },
      select: { boardId: true },
    });

    if (!memory) {
      throw new Error("MEMORY_NOT_FOUND");
    }

    await lockBoard(tx, memory.boardId, "UPDATE");
    await validateBoardAccess(tx, userId, memory.boardId);

    return tx.memory.delete({
      where: { id: memoryId },
    });
  });
}
