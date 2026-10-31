import { Router } from "express";

import { registerController } from "./auth.controller.js";
import { registerSchema } from "../../schemas/auth.schema.js";
import { validateRequest } from "../../middlewares/validate-request.js";

const router = Router();

router.post(
    "/register",
    validateRequest({body: registerSchema}),
    registerController,
);

export default router;