import { Router } from "express";

import { validateRequest } from "../../middlewares/validate-request.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { loginSchema, registerSchema } from "../../schemas/auth.schema.js";

//controllers
import {
  loginController,
  logoutController,
  meController,
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

router.get("/me", requireAuth, meController);

router.post("/logout", logoutController);

export default router;