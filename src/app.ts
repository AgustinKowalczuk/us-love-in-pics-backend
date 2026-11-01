import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env.js";
import { sessionMiddleware } from "./config/session.js";
import { errorHandler } from "./middlewares/error-handler.js";

import apiRouter from "./routes/index.js";

export const app = express();

app.disable("x-powered-by");

//middlewares
app.use(helmet());

if (env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));

app.use(sessionMiddleware);

//routes
app.use("/api/v1", apiRouter);

//routes error
app.use((_req, res) => {
  res.status(404).json({
    status: "error",
    message: "Ruta no encontrada",
  });
});

app.use(errorHandler);
