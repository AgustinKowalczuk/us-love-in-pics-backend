
import { Router } from "express";

import { requireVerifiedEmail } from "../../middlewares/require-verified-email.js";
import { validateRequest } from "../../middlewares/validate-request.js";

import {
  createMemoryNoteSchema,
  memoryNoteMemoryParamsSchema,
  memoryNoteParamsSchema,
  updateMemoryNoteSchema,
} from "../../schemas/memory-note.schema.js";

import {
  createMemoryNoteController,
  getMemoryNotesController,
  updateMemoryNoteController,
  deleteMemoryNoteController,
} from "./memory-note.controller.js";

const router = Router();

// Create a note inside a memory pin.
router.post(
  "/:memoryId/notes",
  requireVerifiedEmail,
  validateRequest({
    params: memoryNoteMemoryParamsSchema,
    body: createMemoryNoteSchema,
  }),
  createMemoryNoteController,
);

// Retrieve all notes belonging to a memory pin.
router.get(
  "/:memoryId/notes",
  requireVerifiedEmail,
  validateRequest({ params: memoryNoteMemoryParamsSchema }),
  getMemoryNotesController,
);

// Update a note by its ID.
router.patch(
  "/notes/:id",
  requireVerifiedEmail,
  validateRequest({
    params: memoryNoteParamsSchema,
    body: updateMemoryNoteSchema,
  }),
  updateMemoryNoteController,
);

// Delete a note by its ID.
router.delete(
  "/notes/:id",
  requireVerifiedEmail,
  validateRequest({ params: memoryNoteParamsSchema }),
  deleteMemoryNoteController,
);

export default router;
