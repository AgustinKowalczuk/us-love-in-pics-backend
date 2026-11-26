import { z } from "zod";

/**
 * Validates the memory pin ID URL parameter.
 */
export const memoryNoteMemoryParamsSchema = z.object({
  memoryId: z.string().uuid("Invalid memory ID"),
});

/**
 * Validates the memory note ID URL parameters.
 */
export const memoryNoteParamsSchema = z.object({
  id: z.string().uuid("Invalid memory note ID"),
});

/**
 * Validates the data required to create a memory note.
 */
export const createMemoryNoteSchema = z
  .object({
    text: z.string().min(1).max(1000),
    position: z.number().int().min(1).max(2),
  })
  .strict();

/**
 * Validates the data required to update a memory note.
 */
export const updateMemoryNoteSchema = z
  .object({
    text: z.string().min(1).max(1000).optional(),
    position: z.number().int().min(1).max(2).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.text !== undefined || data.position !== undefined,
    "At least one field must be provided",
  );