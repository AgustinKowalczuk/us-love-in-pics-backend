
import express from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";

import { validateRequest } from "../middlewares/validate-request.js";
import {
  exampleSchema,
  uuidSchema,
} from "../schemas/common.schema.js";

import { z } from "zod";

function createTestApp() {
  const app = express();

  app.use(express.json());

  // Validación del body
  app.post(
    "/body",
    validateRequest({
      body: exampleSchema,
    }),
    (req, res) => {
      res.status(200).json({
        status: "ok",
        data: req.body,
      });
    },
  );

  // Validación de parámetros de URL
  app.get(
    "/params/:id",
    validateRequest({
      params: z.object({
        id: uuidSchema,
      }),
    }),
    (_req, res) => {
      res.status(200).json({
        status: "ok",
      });
    },
  );

  // Validación de query parameters
  app.get(
    "/query",
    validateRequest({
      query: z.object({
        page: z.coerce.number().int().positive(),
      }),
    }),
    (_req, res) => {
      res.status(200).json({
        status: "ok",
      });
    },
  );

  return app;
}

const app = createTestApp();

describe("Middleware validateRequest", () => {
  describe("Validación del body", () => {
    it("acepta datos válidos y aplica las transformaciones", async () => {
      const response = await request(app)
        .post("/body")
        .send({
          name: "  Agustin  ",
          email: "AGUSTIN@EXAMPLE.COM",
        });

      expect(response.status).toBe(200);

      expect(response.body.data).toEqual({
        name: "Agustin",
        email: "agustin@example.com",
      });
    });

    it("rechaza un email inválido", async () => {
      const response = await request(app)
        .post("/body")
        .send({
          name: "Agustin",
          email: "correo-invalido",
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe("error");
      expect(response.body.errors.body).toBeDefined();
    });

    it("rechaza un nombre demasiado corto", async () => {
      const response = await request(app)
        .post("/body")
        .send({
          name: "A",
          email: "agustin@example.com",
        });

      expect(response.status).toBe(400);
    });
  });

  describe("Validación de parámetros", () => {
    it("rechaza un UUID inválido", async () => {
      const response = await request(app)
        .get("/params/identificador-invalido");

      expect(response.status).toBe(400);
      expect(response.body.errors.params).toBeDefined();
    });

    it("acepta un UUID válido", async () => {
      const response = await request(app)
        .get("/params/550e8400-e29b-41d4-a716-446655440000");

      expect(response.status).toBe(200);
    });
  });

  describe("Validación de query parameters", () => {
    it("acepta un número de página válido", async () => {
      const response = await request(app)
        .get("/query?page=2");

      expect(response.status).toBe(200);
    });

    it("rechaza un número de página inválido", async () => {
      const response = await request(app)
        .get("/query?page=-1");

      expect(response.status).toBe(400);
      expect(response.body.errors.query).toBeDefined();
    });
  });
});
