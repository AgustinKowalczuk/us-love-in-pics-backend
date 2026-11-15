
import type { RequestHandler } from "express";
import type { z } from "zod";

type RequestSchemas = {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
};

export function validateRequest(
  schemas: RequestSchemas,
): RequestHandler {
  return (req, res, next) => {
    const validationErrors: Record<string, unknown> = {};

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);

      if (!result.success) {
        validationErrors.body = result.error.issues;
      } else {
        req.body = result.data;
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);

      if (!result.success) {
        validationErrors.params = result.error.issues;
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);

      if (!result.success) {
        validationErrors.query = result.error.issues;
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      res.status(400).json({
        status: "error",
        message: "Los datos enviados no son válidos",
        errors: validationErrors,
      });

      return;
    }

    next();
  };
}
