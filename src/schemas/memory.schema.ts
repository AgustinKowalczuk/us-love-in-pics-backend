import { z } from "zod";

/**
 * Validates the data required to create a memory.
 */
export const createMemorySchema = z
  .object({
    boardId: z.string().uuid("Invalid board ID"),
    type: z.enum(["NOTE", "PHOTO", "GIF"]),
    text: z.string().trim().max(5000).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "NOTE" && !data.text?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: "Notes must contain text",
      });
    }

    if (data.type === "PHOTO" || data.type === "GIF") {
      if (data.text?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["text"],
          message: "Media memories cannot contain text",
        });
      }
    }
  });

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
 * Validates the data required to update a memory.
 */
export const updateMemorySchema = z
  .object({
    text: z.string().trim().min(1).max(5000),
  })
  .strict();
