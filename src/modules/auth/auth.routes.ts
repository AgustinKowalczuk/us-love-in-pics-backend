import { Router } from "express";

import { validateRequest } from "../../middlewares/validate-request.js";
import { loginSchema, registerSchema } from "../../schemas/auth.schema.js";

import {
  loginController,
  registerController,
} from "./auth.controller.js";

const router = Router();

router.post(
  "/register",
  validateRequest({ body: registerSchema }),
  registerController,
);

router.post(
  "/login",
  validateRequest({ body: loginSchema }),
  loginController,
);

export default router;