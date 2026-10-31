import { z } from "zod";

import {
  emailSchema,
  nameSchema,
  passwordSchema,
} from "./common.schema.js";

//register schema
export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;

//login schema
export const loginSchema=z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;