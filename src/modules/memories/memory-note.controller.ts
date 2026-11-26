import type { RequestHandler } from "express";

import {
  createMemoryNote,
  getMemoryNotes,
  updateMemoryNote,
  deleteMemoryNote,
} from "./memory-note.service.js";

/**
 * Handles memory note service errors and maps them to HTTP responses.
 */
function handleMemoryNoteError(
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
    MEMORY_NOTE_NOT_FOUND: {
      statusCode: 404,
      message: "Memory note not found",
    },
    INVALID_MEMORY_NOTE_POSITION: {
      statusCode: 400,
      message: "Invalid memory note position",
    },
    MEMORY_NOTE_POSITION_TAKEN: {
      statusCode: 409,
      message: "The selected note position is already occupied",
    },
    MEMORY_NOTE_LIMIT_REACHED: {
      statusCode: 400,
      message: "The memory pin cannot contain more than two notes",
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
 * Creates a note belonging to a memory pin.
 */
export const createMemoryNoteController: RequestHandler = async (
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
    const { text, position } = req.body;

    const note = await createMemoryNote(userId, memoryId, {
      text,
      position,
    });

    res.status(201).json({
      status: "success",
      message: "Memory note created successfully",
      data: { note },
    });
  } catch (error) {
    handleMemoryNoteError(error, next, res);
  }
};

/**
 * Retrieves all notes belonging to a memory pin.
 */
export const getMemoryNotesController: RequestHandler = async (
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
    const notes = await getMemoryNotes(userId, memoryId);

    res.status(200).json({
      status: "success",
      message: "Memory notes retrieved successfully",
      data: { notes },
    });
  } catch (error) {
    handleMemoryNoteError(error, next, res);
  }
};

/**
 * Updates a note belonging to a memory pin.
 */
export const updateMemoryNoteController: RequestHandler = async (
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
    const noteId = req.params.id as string;
    const { text, position } = req.body;

    const note = await updateMemoryNote(userId, noteId, {
      ...(text !== undefined && { text }),
      ...(position !== undefined && { position }),
    });

    res.status(200).json({
      status: "success",
      message: "Memory note updated successfully",
      data: { note },
    });
  } catch (error) {
    handleMemoryNoteError(error, next, res);
  }
};

/**
 * Deletes a note belonging to a memory pin.
 */
export const deleteMemoryNoteController: RequestHandler = async (
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
    const noteId = req.params.id as string;
    const note = await deleteMemoryNote(userId, noteId);

    res.status(200).json({
      status: "success",
      message: "Memory note deleted successfully",
      data: { note },
    });
  } catch (error) {
    handleMemoryNoteError(error, next, res);
  }
};