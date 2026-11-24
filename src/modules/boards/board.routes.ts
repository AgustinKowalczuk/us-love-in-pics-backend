import { Router } from "express";

import { requireVerifiedEmail } from "../../middlewares/require-verified-email.js";
import { validateRequest } from "../../middlewares/validate-request.js";

import {
  boardIdParamsSchema,
  createBoardSchema,
} from "../../schemas/board.schema.js";

import {
  createBoardController,
  getMyActiveBoardController,
  getBoardByIdController,
  archiveBoardController
} from "./board.controller.js";

const router = Router();

// Create board from an accepted invitation.
router.post(
  "/",
  requireVerifiedEmail,
  validateRequest({ body: createBoardSchema }),
  createBoardController,
);

// Retrieve the authenticated user's active board.
router.get(
  "/me",
  requireVerifiedEmail,
  getMyActiveBoardController,
);

// Retrieve a specific board.
router.get(
  "/:id",
  requireVerifiedEmail,
  validateRequest({ params: boardIdParamsSchema }),
  getBoardByIdController,
);

// Archive a board and its active memberships.
router.patch(
  "/:id/archive",
  requireVerifiedEmail,
  validateRequest({ params: boardIdParamsSchema }),
  archiveBoardController,
);

export default router;