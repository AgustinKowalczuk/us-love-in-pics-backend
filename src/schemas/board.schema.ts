import { z } from "zod";

export const createBoardSchema = z.object({
  invitationId: z.string().uuid("Invalid invitation ID"),
});

/**
 * Validates the board ID URL parameter.
 */
export const boardIdParamsSchema = z.object({
  id: z.string().uuid("Invalid board ID"),
});