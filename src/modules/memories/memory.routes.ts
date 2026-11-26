import { Router } from "express";

import { requireVerifiedEmail } from "../../middlewares/require-verified-email.js";
import { validateRequest } from "../../middlewares/validate-request.js";

import {
  createMemorySchema,
  memoryIdParamsSchema,
  memoryBoardParamsSchema,
  updateMemorySchema,
} from "../../schemas/memory.schema.js";

import {
  createMemoryController,
  getMemoriesController,
  getMemoryByIdController,
  updateMemoryController,
  deleteMemoryController,
} from "./memory.controller.js";

const router = Router();

// Create a memory pin in an active board.
router.post(
  "/",
  requireVerifiedEmail,
  validateRequest({ body: createMemorySchema }),
  createMemoryController,
);

// Retrieve all memory pins belonging to a board.
router.get(
  "/board/:boardId",
  requireVerifiedEmail,
  validateRequest({ params: memoryBoardParamsSchema }),
  getMemoriesController,
);

// Retrieve a specific memory pin.
router.get(
  "/:id",
  requireVerifiedEmail,
  validateRequest({ params: memoryIdParamsSchema }),
  getMemoryByIdController,
);

// Update a memory pin's date or position.
router.patch(
  "/:id",
  requireVerifiedEmail,
  validateRequest({
    params: memoryIdParamsSchema,
    body: updateMemorySchema,
  }),
  updateMemoryController,
);

// Delete a memory pin.
router.delete(
  "/:id",
  requireVerifiedEmail,
  validateRequest({ params: memoryIdParamsSchema }),
  deleteMemoryController,
);

export default router;