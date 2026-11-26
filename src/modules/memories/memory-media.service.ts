
import { prisma } from "../../config/prisma.js";
import {
  lockBoard,
  validateBoardAccess,
} from "./memory-access.js";
import { validateMemoryComposition } from "./memory-composition.js";

interface CreateMemoryMediaData {
  mediaType: "PHOTO" | "GIF";
  storageKey: string;
  takenAt?: string;
  description?: string;
  position: number;
}

interface UpdateMemoryMediaData {
  takenAt?: string | null;
  description?: string | null;
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
 * Retrieves a media record and its associated board ID.
 */
async function getMemoryMediaContext(mediaId: string) {
  const media = await prisma.memoryMedia.findUnique({
    where: { id: mediaId },
    select: {
      id: true,
      memory: {
        select: {
          id: true,
          boardId: true,
        },
      },
    },
  });

  if (!media) {
    throw new Error("MEMORY_MEDIA_NOT_FOUND");
  }

  return media.memory;
}

/**
 * Validates media metadata before creating or updating a record.
 */
function validateMediaData(
  mediaType: "PHOTO" | "GIF",
  data: {
    takenAt?: string | null;
    description?: string | null;
  },
): void {
    if (data.takenAt !== undefined && data.takenAt !== null) {
    const date = new Date(`${data.takenAt}T00:00:00.000Z`);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(data.takenAt) ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== data.takenAt
    ) {
      throw new Error("INVALID_MEMORY_MEDIA_DATE");
    }
  }
}

/**
 * Creates media metadata after validating board access and pin composition.
 */
export async function createMemoryMedia(
  userId: string,
  memoryId: string,
  data: CreateMemoryMediaData,
) {
  if (
    !Number.isInteger(data.position) ||
    data.position < 1 ||
    data.position > 3
  ) {
    throw new Error("INVALID_MEMORY_MEDIA_POSITION");
  }

  if (!data.storageKey.trim()) {
    throw new Error("INVALID_MEMORY_MEDIA_STORAGE_KEY");
  }

  validateMediaData(data.mediaType, data);

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

      const [media, noteCount] = await Promise.all([
        tx.memoryMedia.findMany({
          where: { memoryId },
          select: { mediaType: true },
        }),
        tx.memoryNote.count({
          where: { memoryId },
        }),
      ]);

      const photoCount = media.filter(
        (item) => item.mediaType === "PHOTO",
      ).length;

      const gifCount = media.filter(
        (item) => item.mediaType === "GIF",
      ).length;

      validateMemoryComposition({
        photoCount: photoCount + (data.mediaType === "PHOTO" ? 1 : 0),
        gifCount: gifCount + (data.mediaType === "GIF" ? 1 : 0),
        noteCount,
      });

      return tx.memoryMedia.create({
        data: {
          memoryId,
          mediaType: data.mediaType,
          storageKey: data.storageKey,
          takenAt: data.takenAt
            ? new Date(`${data.takenAt}T00:00:00.000Z`)
            : null,
          description: data.description?.trim() || null,
          position: data.position,
        },
      });
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new Error("MEMORY_MEDIA_POSITION_TAKEN");
    }

    throw error;
  }
}

/**
 * Retrieves all media records belonging to a memory pin.
 */
export async function getMemoryMedia(
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

    const existingMemory = await tx.memory.findUnique({
      where: { id: memoryId },
      select: { id: true },
    });

    if (!existingMemory) {
      throw new Error("MEMORY_NOT_FOUND");
    }

    return tx.memoryMedia.findMany({
      where: { memoryId },
      orderBy: { position: "asc" },
    });
  });
}

/**
 * Updates media metadata after validating board access.
 */
export async function updateMemoryMedia(
  userId: string,
  mediaId: string,
  data: UpdateMemoryMediaData,
) {
  if (
    data.position !== undefined &&
    (!Number.isInteger(data.position) ||
      data.position < 1 ||
      data.position > 3)
  ) {
    throw new Error("INVALID_MEMORY_MEDIA_POSITION");
  }

  const memory = await getMemoryMediaContext(mediaId);

  try {
    return await prisma.$transaction(async (tx) => {
      await lockBoard(tx, memory.boardId, "UPDATE");
      await validateBoardAccess(tx, userId, memory.boardId);

      const existingMedia = await tx.memoryMedia.findUnique({
        where: { id: mediaId },
      });

      if (!existingMedia) {
        throw new Error("MEMORY_MEDIA_NOT_FOUND");
      }

      const nextTakenAt =
        data.takenAt !== undefined
          ? data.takenAt
          : existingMedia.takenAt?.toISOString().slice(0, 10) ?? null;

      const nextDescription =
        data.description !== undefined
          ? data.description
          : existingMedia.description;

      validateMediaData(existingMedia.mediaType, {
        takenAt: nextTakenAt,
        description: nextDescription,
      });

      return tx.memoryMedia.update({
        where: { id: mediaId },
        data: {
          ...(data.takenAt !== undefined && {
            takenAt: data.takenAt
              ? new Date(`${data.takenAt}T00:00:00.000Z`)
              : null,
          }),
          ...(data.description !== undefined && {
            description: data.description?.trim() || null,
          }),
          ...(data.position !== undefined && {
            position: data.position,
          }),
        },
      });
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new Error("MEMORY_MEDIA_POSITION_TAKEN");
    }

    throw error;
  }
}

/**
 * Deletes media metadata after validating board access.
 */
export async function deleteMemoryMedia(
  userId: string,
  mediaId: string,
) {
  const memory = await getMemoryMediaContext(mediaId);

  return prisma.$transaction(async (tx) => {
    await lockBoard(tx, memory.boardId, "UPDATE");
    await validateBoardAccess(tx, userId, memory.boardId);

    const existingMedia = await tx.memoryMedia.findUnique({
      where: { id: mediaId },
      select: { id: true },
    });

    if (!existingMedia) {
      throw new Error("MEMORY_MEDIA_NOT_FOUND");
    }

    return tx.memoryMedia.delete({
      where: { id: mediaId },
    });
  });
}
