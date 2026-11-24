import type { RequestHandler } from "express";

import {
  createBoard,
  getMyActiveBoard,
  getBoardById,
  archiveBoard
} from "./board.service.js";

/**
 * Handles board service errors and maps them to HTTP responses.
 */
function handleBoardError(
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
    INVITATION_NOT_FOUND: {
      statusCode: 404,
      message: "Invitation not found",
    },
    INVITATION_NOT_ACCEPTED: {
      statusCode: 409,
      message: "Invitation has not been accepted",
    },
    NOT_INVITATION_SENDER: {
      statusCode: 403,
      message: "Only the invitation sender can create the board",
    },
    INVITATION_RECIPIENT_NOT_FOUND: {
      statusCode: 409,
      message: "Invitation has no associated recipient",
    },
    INVITATION_USERS_CHANGED: {
      statusCode: 409,
      message: "Invitation users have changed",
    },
    INVITATION_USER_NOT_FOUND: {
      statusCode: 404,
      message: "Invitation user not found",
    },
    EMAIL_NOT_VERIFIED: {
      statusCode: 403,
      message: "Both users must have verified email addresses",
    },
    USER_ALREADY_HAS_ACTIVE_BOARD: {
      statusCode: 409,
      message: "One or both users already belong to an active board",
    },
    BOARD_ALREADY_EXISTS: {
      statusCode: 409,
      message: "A board already exists for this invitation",
    },
    BOARD_CONFLICT: {
      statusCode: 409,
      message: "Board creation conflict",
    },
    ACTIVE_BOARD_NOT_FOUND: {
      statusCode: 404,
      message: "You do not have an active board",
    },
    BOARD_NOT_FOUND: {
      statusCode: 404,
      message: "Board not found",
    },
    NOT_BOARD_MEMBER: {
      statusCode: 403,
      message: "You are not an active member of this board",
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
 * Creates a board from an accepted invitation.
 */
export const createBoardController: RequestHandler = async (req, res, next) => {
  const userId = req.session.userId;

  if (!userId) {
    res.status(401).json({
      status: "error",
      message: "Authentication required",
    });
    return;
  }

  try {
    const { invitationId } = req.body;

    const board = await createBoard(userId, invitationId);

    res.status(201).json({
      status: "success",
      message: "Board created successfully",
      data: {
        board,
      },
    });
  } catch (error) {
    handleBoardError(error, next, res);
  }
};

/**
 * Retrieves the authenticated user's active board.
 */
export const getMyActiveBoardController: RequestHandler = async (
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
    const board = await getMyActiveBoard(userId);

    res.status(200).json({
      status: "success",
      message: "Active board retrieved successfully",
      data: {
        board,
      },
    });
  } catch (error) {
    handleBoardError(error, next, res);
  }
};

/**
 * Retrieves a specific board for one of its active members.
 */
export const getBoardByIdController: RequestHandler = async (
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
    const boardId = req.params.id;

    if (typeof boardId !== "string") {
      res.status(400).json({
        status: "error",
        message: "Invalid board ID",
      });
      return;
    }

    const board = await getBoardById(userId, boardId);

    res.status(200).json({
      status: "success",
      message: "Board retrieved successfully",
      data: {
        board,
      },
    });
  } catch (error) {
    handleBoardError(error, next, res);
  }
};

/**
 * Archives a board and its active memberships.
 */
export const archiveBoardController: RequestHandler = async (
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

    const boardId = req.params.id;

    if (typeof boardId !== "string") {
      res.status(400).json({
        status: "error",
        message: "Invalid board ID",
      });
      return;
    }

    const board = await archiveBoard(userId, boardId);

    res.status(200).json({
      status: "success",
      message: "Board archived successfully",
      data: {
        board,
      },
    });
  } catch (error) {
    handleBoardError(error, next, res);
  }
};