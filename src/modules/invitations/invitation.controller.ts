import type { RequestHandler } from "express";

import {
  createInvitation,
  resendInvitation,
  cancelInvitation,
  listSentInvitations,
  listReceivedInvitations
} from "./invitation.service.js";

const invitationErrors: Record<string, { status: number; message: string }> = {
  USER_NOT_FOUND: {
    status: 404,
    message: "User not found",
  },
  EMAIL_NOT_VERIFIED: {
    status: 403,
    message: "Email verification required",
  },
  CANNOT_INVITE_SELF: {
    status: 400,
    message: "You cannot invite yourself",
  },
  SENDER_ALREADY_HAS_ACTIVE_BOARD: {
    status: 409,
    message: "You already belong to an active board",
  },
  PENDING_INVITATION_ALREADY_EXISTS: {
    status: 409,
    message: "You already have a pending invitation",
  },
  INVITATION_NOT_FOUND: {
    status: 404,
    message: "Invitation not found",
  },
  INVITATION_NOT_PENDING: {
    status: 409,
    message: "This invitation is no longer pending",
  },
  INVITATION_EXPIRED: {
    status: 410,
    message: "This invitation has expired",
  },
  RESEND_COOLDOWN_ACTIVE: {
    status: 429,
    message: "Please wait before resending this invitation",
  },
  EMAIL_DELIVERY_FAILED: {
    status: 502,
    message: "Unable to deliver the invitation email",
  },
};

function getInvitationId(id: string | string[]): string {
  if (typeof id !== "string") {
    throw new Error("INVALID_INVITATION_ID");
  }

  return id;
}

function handleInvitationError(
  error: unknown,
  next: Parameters<RequestHandler>[2],
  res: Parameters<RequestHandler>[1],
) {
  if (error instanceof Error) {
    const knownError = invitationErrors[error.message];

    if (knownError) {
      res.status(knownError.status).json({
        status: "error",
        message: knownError.message,
        code: error.message,
      });

      return;
    }
  }

  next(error);
}

export const createInvitationController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const senderId = req.session.userId;

    if (!senderId) {
      res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
      return;
    }

    const invitation = await createInvitation(
      senderId,
      req.body.recipientEmail,
    );

    res.status(201).json({
      status: "success",
      message: invitation.message,
      data: {
        invitation: invitation.invitation,
      },
    });
  } catch (error) {
    handleInvitationError(error, next, res);
  }
};

export const resendInvitationController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const senderId = req.session.userId;

    if (!senderId) {
      res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
      return;
    }

    const invitation = await resendInvitation(
      senderId,
      getInvitationId(req.params.id),
    );

    res.status(200).json({
      status: "success",
      message: invitation.message,
      data: {
        invitation: invitation.invitation,
        nextResendAt: invitation.nextResendAt,
      },
    });
  } catch (error) {
    handleInvitationError(error, next, res);
  }
};

export const cancelInvitationController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const senderId = req.session.userId;

    if (!senderId) {
      res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
      return;
    }

    const result = await cancelInvitation(
      senderId,
      getInvitationId(req.params.id),
    );

    res.status(200).json({
      status: "success",
      message: result.message,
      data: {
        invitationId: result.invitationId,
      },
    });
  } catch (error) {
    handleInvitationError(error, next, res);
  }
};

export const listSentInvitationsController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const senderId = req.session.userId;

    if (!senderId) {
      res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
      return;
    }

    const result = await listSentInvitations(senderId);

    res.status(200).json({
      status: "success",
      data: {
        invitations: result.invitations,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const listReceivedInvitationsController: RequestHandler = async (
  req,
  res,
  next,
) => {
  const userId = req.session.userId;

  if (!userId) {
    res.status(401).json({
      status: "error",
      message: "Authentication required",
    });
    return;
  }

  try {
    const result = await listReceivedInvitations(userId);

    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case "USER_NOT_FOUND":
          res.status(404).json({
            status: "error",
            message: "User not found",
          });
          return;

        case "EMAIL_NOT_VERIFIED":
          res.status(403).json({
            status: "error",
            message: "Email verification required",
          });
          return;
      }
    }

    next(error);
  }
};