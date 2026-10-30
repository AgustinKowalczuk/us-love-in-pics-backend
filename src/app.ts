import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env.js";
import apiRouter from "./routes/index.js";
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