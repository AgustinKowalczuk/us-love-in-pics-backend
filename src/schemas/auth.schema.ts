import { z } from "zod";

import {
  emailSchema,
  nameSchema,
  passwordSchema,
} from "./common.schema.js";

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;