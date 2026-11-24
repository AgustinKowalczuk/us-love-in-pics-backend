
import type { RequestHandler } from "express";

import {
  createMemory,
  getMemories,
  getMemoryById,
  updateMemory,
  deleteMemory,
} from "./memory.service.js";

/**
 * Handles memory service errors and maps them to HTTP responses.
 */
function handleMemoryError(
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
    NOTE_LIMIT_REACHED: {
      statusCode: 409,
      message: "The board has reached its note limit",
    },
    PHOTO_LIMIT_REACHED: {
      statusCode: 409,
      message: "The board has reached its photo limit",
    },
    GIF_LIMIT_REACHED: {
      statusCode: 409,
      message: "The board has reached its GIF limit",
    },
    MEMORY_NOT_EDITABLE: {
      statusCode: 409,
      message: "Only note memories can be updated",
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
 * Creates a memory in an active board.
 */
export const createMemoryController: RequestHandler = async (
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
    const { boardId, type, text } = req.body;

    if (
      typeof boardId !== "string" ||
      !["NOTE", "PHOTO", "GIF"].includes(type)
    ) {
      res.status(400).json({
        status: "error",
        message: "Invalid memory data",
      });
      return;
    }

    if (type === "NOTE" && typeof text !== "string") {
      res.status(400).json({
        status: "error",
        message: "Note text is required",
      });
      return;
    }

    const memory = await createMemory(userId, {
      boardId,
      type,
      text,
    });

    res.status(201).json({
      status: "success",
      message: "Memory created successfully",
      data: {
        memory,
      },
    });
  } catch (error) {
    handleMemoryError(error, next, res);
  }
};

/**
 * Retrieves all memories belonging to a board.
 */
export const getMemoriesController: RequestHandler = async (
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
    const boardId = req.params.boardId;

    if (typeof boardId !== "string") {
      res.status(400).json({
        status: "error",
        message: "Invalid board ID",
      });
      return;
    }

    const memories = await getMemories(userId, boardId);

    res.status(200).json({
      status: "success",
      message: "Memories retrieved successfully",
      data: {
        memories,
      },
    });
  } catch (error) {
    handleMemoryError(error, next, res);
  }
};

/**
 * Retrieves a specific memory.
 */
export const getMemoryByIdController: RequestHandler = async (
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
    const memoryId = req.params.id;

    if (typeof memoryId !== "string") {
      res.status(400).json({
        status: "error",
        message: "Invalid memory ID",
      });
      return;
    }

    const memory = await getMemoryById(userId, memoryId);

    res.status(200).json({
      status: "success",
      message: "Memory retrieved successfully",
      data: {
        memory,
      },
    });
  } catch (error) {
    handleMemoryError(error, next, res);
  }
};

/**
 * Updates the text of a note memory.
 */
export const updateMemoryController: RequestHandler = async (
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
    const memoryId = req.params.id;
    const { text } = req.body;

    if (typeof memoryId !== "string") {
      res.status(400).json({
        status: "error",
        message: "Invalid memory ID",
      });
      return;
    }

    if (typeof text !== "string") {
      res.status(400).json({
        status: "error",
        message: "Note text is required",
      });
      return;
    }

    const memory = await updateMemory(userId, memoryId, text);

    res.status(200).json({
      status: "success",
      message: "Memory updated successfully",
      data: {
        memory,
      },
    });
  } catch (error) {
    handleMemoryError(error, next, res);
  }
};

/**
 * Deletes a memory and its associated media metadata.
 */
export const deleteMemoryController: RequestHandler = async (
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
    const memoryId = req.params.id;

    if (typeof memoryId !== "string") {
      res.status(400).json({
        status: "error",
        message: "Invalid memory ID",
      });
      return;
    }

    const memory = await deleteMemory(userId, memoryId);

    res.status(200).json({
      status: "success",
      message: "Memory deleted successfully",
      data: {
        memory,
      },
    });
  } catch (error) {
    handleMemoryError(error, next, res);
  }
};
