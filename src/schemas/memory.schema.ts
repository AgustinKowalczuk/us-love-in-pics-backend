import { z } from "zod";

/**
 * Validates a date-only value in YYYY-MM-DD format.
 */
const memoryDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid memory date")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Invalid memory date");

/**
 * Validates the data required to create a memory pin.
 */
export const createMemorySchema = z
  .object({
    boardId: z.string().uuid("Invalid board ID"),
    memoryDate: memoryDateSchema,
    position: z.number().int().min(1).max(13),
  })
  .strict();

/**
 * Validates the memory ID URL parameter.
 */
export const memoryIdParamsSchema = z.object({
  id: z.string().uuid("Invalid memory ID"),
});

/**
 * Validates the board ID URL parameter.
 */
export const memoryBoardParamsSchema = z.object({
  boardId: z.string().uuid("Invalid board ID"),
});

/**
 * Validates the data required to update a memory pin.
 */
export const updateMemorySchema = z
  .object({
    memoryDate: memoryDateSchema.optional(),
    position: z.number().int().min(1).max(13).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.memoryDate !== undefined || data.position !== undefined,
    "At least one field must be provided",
  );