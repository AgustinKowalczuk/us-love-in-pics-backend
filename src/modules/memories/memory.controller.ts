
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
    MEMORY_POSITION_TAKEN: {
      statusCode: 409,
      message: "The selected memory position is already occupied",
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
 * Creates a memory pin in an active board.
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
    const { boardId, memoryDate, position } = req.body;

    const memory = await createMemory(userId, {
      boardId,
      memoryDate,
      position,
    });

    res.status(201).json({
      status: "success",
      message: "Memory created successfully",
      data: { memory },
    });
  } catch (error) {
    handleMemoryError(error, next, res);
  }
};

/**
 * Retrieves all memory pins belonging to a board.
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

    const memories = await getMemories(userId, boardId as string);

    res.status(200).json({
      status: "success",
      message: "Memories retrieved successfully",
      data: { memories },
    });
  } catch (error) {
    handleMemoryError(error, next, res);
  }
};

/**
 * Retrieves a specific memory pin.
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

    const memory = await getMemoryById(userId, memoryId as string);

    res.status(200).json({
      status: "success",
      message: "Memory retrieved successfully",
      data: { memory },
    });
  } catch (error) {
    handleMemoryError(error, next, res);
  }
};

/**
 * Updates a memory pin's date and/or position.
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
    const { memoryDate, position } = req.body;

    const memory = await updateMemory(userId, memoryId as string, {
      ...(memoryDate !== undefined && { memoryDate }),
      ...(position !== undefined && { position }),
    });

    res.status(200).json({
      status: "success",
      message: "Memory updated successfully",
      data: { memory },
    });
  } catch (error) {
    handleMemoryError(error, next, res);
  }
};

/**
 * Deletes a memory pin and its associated content metadata.
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

    const memory = await deleteMemory(userId, memoryId as string);

    res.status(200).json({
      status: "success",
      message: "Memory deleted successfully",
      data: { memory },
    });
  } catch (error) {
    handleMemoryError(error, next, res);
  }
};
