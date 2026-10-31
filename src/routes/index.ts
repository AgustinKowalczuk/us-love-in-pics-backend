import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes.js";
import healthRouter from "../modules/health/health.routes.js";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth",authRoutes);

export default apiRouter;
