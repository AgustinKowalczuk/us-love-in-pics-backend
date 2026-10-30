import { z } from "zod";

/**
 * Validación de identificadores UUID.
 */
export const uuidSchema = z
  .string()
  .uuid("El identificador proporcionado no es válido");

/**
 * Validación de nombres personales.
 */
export const nameSchema = z
  .string()
  .trim()
  .min(2, "El nombre debe tener al menos 2 caracteres")
  .max(60, "El nombre no puede superar los 60 caracteres");

/**
 * Validación de direcciones de correo electrónico.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("El correo electrónico no es válido")
  .max(254, "El correo electrónico es demasiado largo");

/**
 * Validación de contraseñas.
 */
export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(128, "La contraseña no puede superar los 128 caracteres");

/**
 * Validación de nombres de tableros.
 */
export const boardNameSchema = z
  .string()
  .trim()
  .min(3, "El nombre del tablero debe tener al menos 3 caracteres")
  .max(100, "El nombre del tablero no puede superar los 100 caracteres");

/**
 * Validación de ejemplo.
 */
export const exampleSchema = z.object({
  name: nameSchema,
  email: emailSchema,
});
