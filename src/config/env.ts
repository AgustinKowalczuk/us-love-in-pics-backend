
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  CORS_ORIGIN: z.string().url().default("http://localhost:3001"),

  FRONTEND_URL: z.string().url().default("http://localhost:3001"),

  SESSION_SECRET: z.string().min(1, "SESSION_SECRET is required"),

  SESSION_MAX_AGE: z.coerce.number().int().positive().default(604800000),

  SMTP_HOST: z.string().min(1, "SMTP_HOST is required"),

  SMTP_PORT: z.coerce.number().int().positive(),

  SMTP_SECURE: z
    .enum(["true", "false"])
    .transform((value) => value === "true"),

  SMTP_USER: z.string().min(1, "SMTP_USER is required"),

  SMTP_PASSWORD: z.string().min(1, "SMTP_PASSWORD is required"),

  EMAIL_FROM: z.string().min(1, "EMAIL_FROM is required"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    "Error en la configuración de variables de entorno:",
    parsedEnv.error.flatten().fieldErrors,
  );

  process.exit(1);
}

export const env = parsedEnv.data;
