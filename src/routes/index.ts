import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes.js";
import healthRouter from "../modules/health/health.routes.js";
import emailVerificationRoutes from "../modules/email-verification/email-verification.routes.js";

const apiRouter = Router();

apiRouter.use("/auth",authRoutes);
apiRouter.use("/email-verification", emailVerificationRoutes);

export default apiRouter;
