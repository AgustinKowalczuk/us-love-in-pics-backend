import { Router } from "express";

import healthRouter from "../modules/health/health.routes.js";
import validationRouter from "../modules/health/health.validation.routes.js";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/health", validationRouter);

export default apiRouter;
