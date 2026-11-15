import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes.js";
import healthRouter from "../modules/health/health.routes.js";
import emailVerificationRoutes from "../modules/email-verification/email-verification.routes.js";
import invitationRoutes from "../modules/invitations/invitation.routes.js";

const apiRouter = Router();

apiRouter.use("/auth",authRoutes);
apiRouter.use("/health", healthRouter);
apiRouter.use("/email-verification", emailVerificationRoutes);
apiRouter.use("/invitations", invitationRoutes);

export default apiRouter;
