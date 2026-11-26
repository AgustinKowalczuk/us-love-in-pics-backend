
import { prisma } from "../../config/prisma.js";
import { lockBoard, validateBoardAccess } from "./memory-access.js";
import { validateMemoryComposition } from "./memory-composition.js";

interface CreateMemoryNoteData {
  text: string;
  position: number;
}

interface UpdateMemoryNoteData {
  text?: string;
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
 * Validates a memory note position.
 */
function validateMemoryNotePosition(position: number): void {
  if (!Number.isInteger(position) || position < 1 || position > 2) {
    throw new Error("INVALID_MEMORY_NOTE_POSITION");
  }
}

/**
 * Retrieves a memory note and its associated board ID.
 */
async function getMemoryNoteContext(noteId: string) {
  const note = await prisma.memoryNote.findUnique({
    where: { id: noteId },
    select: {
      memory: {
        select: {
          id: true,
          boardId: true,
        },
      },
    },
  });

  if (!note) {
    throw new Error("MEMORY_NOTE_NOT_FOUND");
  }

  return note.memory;
}

/**
 * Creates a note after validating board access and pin composition.
 */
export async function createMemoryNote(
  userId: string,
  memoryId: string,
  data: CreateMemoryNoteData,
) {
  validateMemoryNotePosition(data.position);

  const memory = await prisma.memory.findUnique({
    where: { id: memoryId },
    select: { id: true, boardId: true },
  });

  if (!memory) {
    throw new Error("MEMORY_NOT_FOUND");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await lockBoard(tx, memory.boardId, "UPDATE");
      await validateBoardAccess(tx, userId, memory.boardId);

      const existingMemory = await tx.memory.findUnique({
        where: { id: memoryId },
        select: { id: true },
      });

      if (!existingMemory) {
        throw new Error("MEMORY_NOT_FOUND");
      }

      const [existingNotes, media] = await Promise.all([
        tx.memoryNote.count({
          where: { memoryId },
        }),
        tx.memoryMedia.findMany({
          where: { memoryId },
          select: { mediaType: true },
        }),
      ]);

      const photoCount = media.filter(
        (item) => item.mediaType === "PHOTO",
      ).length;

      const gifCount = media.filter(
        (item) => item.mediaType === "GIF",
      ).length;

      validateMemoryComposition({
        photoCount,
        gifCount,
        noteCount: existingNotes + 1,
      });

      if (existingNotes >= 2) {
        throw new Error("MEMORY_NOTE_LIMIT_REACHED");
      }

      return tx.memoryNote.create({
        data: {
          memoryId,
          text: data.text,
          position: data.position,
        },
      });
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new Error("MEMORY_NOTE_POSITION_TAKEN");
    }

    throw error;
  }
}

/**
 * Retrieves all notes belonging to a memory pin.
 */
export async function getMemoryNotes(userId: string, memoryId: string) {
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

    const existingMemory = await tx.memory.findUnique({
      where: { id: memoryId },
      select: { id: true },
    });

    if (!existingMemory) {
      throw new Error("MEMORY_NOT_FOUND");
    }

    return tx.memoryNote.findMany({
      where: { memoryId },
      orderBy: { position: "asc" },
    });
  });
}

/**
 * Updates a note after validating board access.
 */
export async function updateMemoryNote(
  userId: string,
  noteId: string,
  data: UpdateMemoryNoteData,
) {
  if (data.position !== undefined) {
    validateMemoryNotePosition(data.position);
  }

  const memory = await getMemoryNoteContext(noteId);

  try {
    return await prisma.$transaction(async (tx) => {
      await lockBoard(tx, memory.boardId, "UPDATE");
      await validateBoardAccess(tx, userId, memory.boardId);

      const existingNote = await tx.memoryNote.findUnique({
        where: { id: noteId },
        select: { id: true },
      });

      if (!existingNote) {
        throw new Error("MEMORY_NOTE_NOT_FOUND");
      }

      return tx.memoryNote.update({
        where: { id: noteId },
        data: {
          ...(data.text !== undefined && { text: data.text }),
          ...(data.position !== undefined && {
            position: data.position,
          }),
        },
      });
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new Error("MEMORY_NOTE_POSITION_TAKEN");
    }

    throw error;
  }
}

/**
 * Deletes a note after validating board access.
 */
export async function deleteMemoryNote(userId: string, noteId: string) {
  const memory = await getMemoryNoteContext(noteId);

  return prisma.$transaction(async (tx) => {
    await lockBoard(tx, memory.boardId, "UPDATE");
    await validateBoardAccess(tx, userId, memory.boardId);

    const existingNote = await tx.memoryNote.findUnique({
      where: { id: noteId },
      select: { id: true },
    });

    if (!existingNote) {
      throw new Error("MEMORY_NOTE_NOT_FOUND");
    }

    return tx.memoryNote.delete({
      where: { id: noteId },
    });
  });
}
