
import { Router } from "express";

import { requireVerifiedEmail } from "../../middlewares/require-verified-email.js";
import { validateRequest } from "../../middlewares/validate-request.js";

import {
  createMemoryMediaSchema,
  memoryMediaMemoryParamsSchema,
  memoryMediaParamsSchema,
  updateMemoryMediaSchema,
} from "../../schemas/memory-media.schema.js";

import {
  createMemoryMediaController,
  getMemoryMediaController,
  updateMemoryMediaController,
  deleteMemoryMediaController,
} from "./memory-media.controller.js";

const router = Router();

// Create media metadata inside a memory pin.
router.post(
  "/:memoryId/media",
  requireVerifiedEmail,
  validateRequest({
    params: memoryMediaMemoryParamsSchema,
    body: createMemoryMediaSchema,
  }),
  createMemoryMediaController,
);

// Retrieve all media metadata belonging to a memory pin.
router.get(
  "/:memoryId/media",
  requireVerifiedEmail,
  validateRequest({ params: memoryMediaMemoryParamsSchema }),
  getMemoryMediaController,
);

// Update media metadata by its ID.
router.patch(
  "/media/:id",
  requireVerifiedEmail,
  validateRequest({
    params: memoryMediaParamsSchema,
    body: updateMemoryMediaSchema,
  }),
  updateMemoryMediaController,
);

// Delete media metadata by its ID.
router.delete(
  "/media/:id",
  requireVerifiedEmail,
  validateRequest({ params: memoryMediaParamsSchema }),
  deleteMemoryMediaController,
);

export default router;
