
import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes.js";
import healthRouter from "../modules/health/health.routes.js";
import emailVerificationRoutes from "../modules/email-verification/email-verification.routes.js";
import invitationRoutes from "../modules/invitations/invitation.routes.js";
import boardRoutes from "../modules/boards/board.routes.js";
import memoryRoutes from "../modules/memories/memory.routes.js";
import memoryNoteRoutes from "../modules/memories/memory-note.routes.js";
import memoryMediaRoutes from "../modules/memories/memory-media.routes.js";

const apiRouter = Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/health", healthRouter);
apiRouter.use("/email-verification", emailVerificationRoutes);
apiRouter.use("/invitations", invitationRoutes);
apiRouter.use("/boards", boardRoutes);
apiRouter.use("/memories", memoryRoutes);
apiRouter.use("/memories", memoryNoteRoutes);
apiRouter.use("/memories", memoryMediaRoutes);

export default apiRouter;
