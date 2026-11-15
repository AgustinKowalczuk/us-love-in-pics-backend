import { Router } from "express";

import { requireVerifiedEmail } from "../../middlewares/require-verified-email.js";
import { validateRequest } from "../../middlewares/validate-request.js";

import {
  createInvitationSchema,
  invitationParamsSchema,
  invitationTokenParamsSchema,
} from "../../schemas/invitation.schema.js";

import {
  createInvitationController,
  resendInvitationController,
  cancelInvitationController,
  listSentInvitationsController,
  listReceivedInvitationsController,
  getInvitationByTokenController,
  acceptInvitationController,
  rejectInvitationController,
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
router.get("/sent", requireVerifiedEmail, listSentInvitationsController);

// List received invitations.
router.get(
  "/received",
  requireVerifiedEmail,
  listReceivedInvitationsController,
);

// Retrieve invitation by token.
router.get(
  "/token/:token",
  validateRequest({ params: invitationTokenParamsSchema }),
  getInvitationByTokenController,
);

// Accept invitation.
router.post(
  "/:id/accept",
  requireVerifiedEmail,
  validateRequest({ params: invitationParamsSchema }),
  acceptInvitationController,
);

// Reject invitation.
router.post(
  "/:id/reject",
  requireVerifiedEmail,
  validateRequest({ params: invitationParamsSchema }),
  rejectInvitationController,
);

export default router;
