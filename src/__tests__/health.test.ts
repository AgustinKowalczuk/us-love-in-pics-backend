
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../config/prisma.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from "../config/prisma.js";
import { app } from "../app.js";

const mockQueryRaw = vi.mocked(prisma.$queryRaw);

describe("GET /api/v1/health", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("responde 200 cuando la base de datos está disponible", async () => {
    mockQueryRaw.mockResolvedValueOnce([] as never);

    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      database: "connected",
      message: "Us Love In Pics API funcionando correctamente",
    });
    expect(mockQueryRaw).toHaveBeenCalledOnce();
  });

  it("responde 503 cuando falla la conexión con la base de datos", async () => {
    mockQueryRaw.mockRejectedValueOnce(
      new Error("Database connection failed"),
    );

    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "error",
      database: "disconnected",
      message: "La base de datos no está disponible",
    });
  });

  it("responde 404 para rutas inexistentes", async () => {
    const response = await request(app).get(
      "/api/v1/ruta-inexistente",
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      status: "error",
      message: "Ruta no encontrada",
    });
  });
});
