import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (
  err,
  _req,
  res,
  _next,
) => {
  console.error(err);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    status: "error",
    message: "Ocurrió un error interno del servidor",
  });
};