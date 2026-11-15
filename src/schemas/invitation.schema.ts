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

export const invitationTokenParamsSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i, "Invalid invitation token"),
});