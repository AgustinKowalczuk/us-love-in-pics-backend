import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { errorHandler } from "./middlewares/error-handler.js";

export const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

if (env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.use(express.json({ limit: "1mb" }));

app.get("/api/v1/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: "ok",
      database: "connected",
      message: "Us Love In Pics API funcionando correctamente",
    });
  } catch {
    res.status(503).json({
      status: "error",
      database: "disconnected",
      message: "La base de datos no está disponible",
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({
    status: "error",
    message: "Ruta no encontrada",
  });
});

app.use(errorHandler);
