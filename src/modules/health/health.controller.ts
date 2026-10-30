import type { Request, Response } from "express";

import { checkDatabaseConnection } from "./health.service.js";

export async function getHealth(
  _req: Request,
  res: Response,
): Promise<void> {
  const databaseConnected = await checkDatabaseConnection();

  if (!databaseConnected) {
    res.status(503).json({
      status: "error",
      database: "disconnected",
      message: "La base de datos no está disponible",
    });

    return;
  }

  res.status(200).json({
    status: "ok",
    database: "connected",
    message: "Us Love In Pics API funcionando correctamente",
  });
}