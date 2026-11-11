import { z } from "zod";

export const createInvitationSchema = z.object({
  recipientEmail: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(255),
});

export const invitationParamsSchema = z.object({
  id: z.string().uuid("Invalid invitation ID"),
});