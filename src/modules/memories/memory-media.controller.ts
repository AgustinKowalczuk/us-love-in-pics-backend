import type { RequestHandler } from "express";

import {
  createMemoryMedia,
  getMemoryMedia,
  updateMemoryMedia,
  deleteMemoryMedia,
} from "./memory-media.service.js";

/**
 * Handles memory media service errors and maps them to HTTP responses.
 */
function handleMemoryMediaError(
  error: unknown,
  next: Parameters<RequestHandler>[2],
  res: Parameters<RequestHandler>[1],
): void {
  if (!(error instanceof Error)) {
    next(error);
    return;
  }

  const errorResponses: Record<
    string,
    { statusCode: number; message: string }
  > = {
    BOARD_NOT_FOUND: {
      statusCode: 404,
      message: "Board not found",
    },
    NOT_BOARD_MEMBER: {
      statusCode: 403,
      message: "You are not an active member of this board",
    },
    MEMORY_NOT_FOUND: {
      statusCode: 404,
      message: "Memory not found",
    },
    MEMORY_MEDIA_NOT_FOUND: {
      statusCode: 404,
      message: "Memory media not found",
    },
    INVALID_MEMORY_MEDIA_POSITION: {
      statusCode: 400,
      message: "Invalid memory media position",
    },
    INVALID_MEMORY_MEDIA_DATE: {
      statusCode: 400,
      message: "Invalid memory media date",
    },
    INVALID_MEMORY_MEDIA_STORAGE_KEY: {
      statusCode: 400,
      message: "Invalid memory media storage key",
    },
    MEMORY_MEDIA_POSITION_TAKEN: {
      statusCode: 409,
      message: "The selected media position is already occupied",
    },
    MEMORY_COMPOSITION_INVALID: {
      statusCode: 400,
      message: "This content combination is not allowed for the memory pin",
    },
  };

  const response = errorResponses[error.message];

  if (response) {
    res.status(response.statusCode).json({
      status: "error",
      message: response.message,
    });
    return;
  }

  next(error);
}

/**
 * Creates media metadata belonging to a memory pin.
 */
export const createMemoryMediaController: RequestHandler = async (
  req,
  res,
  next,
) => {
  const userId = req.session.userId;

  if (!userId) {
    res.status(401).json({
      status: "error",
      message: "Authentication required",
    });
    return;
  }

  try {
    const memoryId = req.params.memoryId as string;
    const { mediaType, storageKey, takenAt, description, position } =
      req.body;

    const media = await createMemoryMedia(userId, memoryId, {
      mediaType,
      storageKey,
      ...(takenAt !== undefined && { takenAt }),
      ...(description !== undefined && { description }),
      position,
    });

    res.status(201).json({
      status: "success",
      message: "Memory media created successfully",
      data: { media },
    });
  } catch (error) {
    handleMemoryMediaError(error, next, res);
  }
};

/**
 * Retrieves all media metadata belonging to a memory pin.
 */
export const getMemoryMediaController: RequestHandler = async (
  req,
  res,
  next,
) => {
  const userId = req.session.userId;

  if (!userId) {
    res.status(401).json({
      status: "error",
      message: "Authentication required",
    });
    return;
  }

  try {
    const memoryId = req.params.memoryId as string;
    const media = await getMemoryMedia(userId, memoryId);

    res.status(200).json({
      status: "success",
      message: "Memory media retrieved successfully",
      data: { media },
    });
  } catch (error) {
    handleMemoryMediaError(error, next, res);
  }
};

/**
 * Updates media metadata belonging to a memory pin.
 */
export const updateMemoryMediaController: RequestHandler = async (
  req,
  res,
  next,
) => {
  const userId = req.session.userId;

  if (!userId) {
    res.status(401).json({
      status: "error",
      message: "Authentication required",
    });
    return;
  }

  try {
    const mediaId = req.params.id as string;
    const { takenAt, description, position } = req.body;

    const media = await updateMemoryMedia(userId, mediaId, {
      ...(takenAt !== undefined && { takenAt }),
      ...(description !== undefined && { description }),
      ...(position !== undefined && { position }),
    });

    res.status(200).json({
      status: "success",
      message: "Memory media updated successfully",
      data: { media },
    });
  } catch (error) {
    handleMemoryMediaError(error, next, res);
  }
};

/**
 * Deletes media metadata belonging to a memory pin.
 */
export const deleteMemoryMediaController: RequestHandler = async (
  req,
  res,
  next,
) => {
  const userId = req.session.userId;

  if (!userId) {
    res.status(401).json({
      status: "error",
      message: "Authentication required",
    });
    return;
  }

  try {
    const mediaId = req.params.id as string;
    const media = await deleteMemoryMedia(userId, mediaId);

    res.status(200).json({
      status: "success",
      message: "Memory media deleted successfully",
      data: { media },
    });
  } catch (error) {
    handleMemoryMediaError(error, next, res);
  }
};