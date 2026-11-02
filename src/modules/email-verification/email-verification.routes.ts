import { Router } from "express";

import { requireAuth } from "../../middlewares/require-auth.js";
import { validateRequest } from "../../middlewares/validate-request.js";
import { confirmEmailSchema } from "../../schemas/email-verification.schema.js";

import {
  requestVerificationController,
  confirmVerificationController,
} from "./email-verification.controller.js";

const router = Router();

// Request email verification
router.post(
  "/request",
  requireAuth,
  requestVerificationController,
);

// Confirm email verification
router.post(
  "/confirm",
  validateRequest({ body: confirmEmailSchema.shape.body }),
  confirmVerificationController,
);

export default router;