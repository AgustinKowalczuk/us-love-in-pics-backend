import { Router } from "express";

import { requireVerifiedEmail } from "../../middlewares/require-verified-email.js";
import { validateRequest } from "../../middlewares/validate-request.js";

import {
  createInvitationSchema,
  invitationParamsSchema,
} from "../../schemas/invitation.schema.js";

import {
  createInvitationController,
  resendInvitationController,
  cancelInvitationController,
  listSentInvitationsController,
  listReceivedInvitationsController
} from "./invitation.controller.js";

const router = Router();

// Create invitation.
router.post(
  "/",
  requireVerifiedEmail,
  validateRequest({ body: createInvitationSchema }),
  createInvitationController,
);

// Resend invitation.
router.post(
  "/:id/resend",
  requireVerifiedEmail,
  validateRequest({ params: invitationParamsSchema }),
  resendInvitationController,
);

// Cancel invitation.
router.delete(
  "/:id",
  requireVerifiedEmail,
  validateRequest({ params: invitationParamsSchema }),
  cancelInvitationController,
);

// List sent invitations.
router.get(
  "/sent",
  requireVerifiedEmail,
  listSentInvitationsController,
);

//List get
router.get(
  "/received",
  requireVerifiedEmail,
  listReceivedInvitationsController,
);


export default router;
