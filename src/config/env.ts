import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  
  CORS_ORIGIN: z.string().url().default("http://localhost:3001"),
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
