
import { z } from "zod";

/**
 * UUID identifier validation.
 */
export const uuidSchema = z
  .string()
  .uuid("The provided identifier is invalid");

/**
 * Personal name validation.
 */
export const nameSchema = z
  .string()
  .trim()
  .min(2, "Name must contain at least 2 characters")
  .max(60, "Name cannot exceed 60 characters");

/**
 * Email address validation.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email address")
  .max(254, "Email address is too long");

/**
 * Password validation.
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must contain at least 8 characters")
  .max(128, "Password cannot exceed 128 characters");

/**
 * Board name validation.
 */
export const boardNameSchema = z
  .string()
  .trim()
  .min(3, "Board name must contain at least 3 characters")
  .max(100, "Board name cannot exceed 100 characters");

/**
 * Example validation schema.
 */
export const exampleSchema = z.object({
  name: nameSchema,
  email: emailSchema,
});
