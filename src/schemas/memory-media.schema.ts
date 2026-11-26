import { z } from "zod";

/**
 * Validates a date-only value in YYYY-MM-DD format.
 */
const mediaDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid media date")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Invalid media date");

/**
 * Validates the memory pin ID URL parameter.
 */
export const memoryMediaMemoryParamsSchema = z.object({
  memoryId: z.string().uuid("Invalid memory ID"),
});

/**
 * Validates the memory media ID URL parameters.
 */
export const memoryMediaParamsSchema = z.object({
  id: z.string().uuid("Invalid memory media ID"),
});
/**
 * Validates the data required to create memory media metadata.
 */
export const createMemoryMediaSchema = z
  .object({
    mediaType: z.enum(["PHOTO", "GIF"]),
    storageKey: z.string().min(1).max(500),
    takenAt: mediaDateSchema.optional(),
    description: z.string().max(500).optional(),
    position: z.number().int().min(1).max(3),
  })
  .strict();

/**
 * Validates the data required to update memory media metadata.
 */
export const updateMemoryMediaSchema = z
  .object({
    takenAt: mediaDateSchema.nullable().optional(),
    description: z.string().max(500).nullable().optional(),
    position: z.number().int().min(1).max(3).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.takenAt !== undefined ||
      data.description !== undefined ||
      data.position !== undefined,
    "At least one field must be provided",
  );