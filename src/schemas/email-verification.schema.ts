import { z } from "zod";

export const confirmEmailSchema = z.object({
  body: z.object({
    token: z.string().trim().min(1, "Verification token is required"),
  }),
});