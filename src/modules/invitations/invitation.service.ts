
import { createHash, randomBytes } from "node:crypto";

import { env } from "../../config/env.js";
import { mailer } from "../../config/mailer.js";
import { prisma } from "../../config/prisma.js";
import {
  encryptInvitationToken,
  decryptInvitationToken
} from "./invitation-crypto.js";

const INVITATION_EXPIRATION_HOURS = 72;
const RESEND_COOLDOWN_MINUTES = 5;

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character] ?? character;
  });
}

export async function createInvitation(
  senderId: string,
  recipientEmail: string,
) {
  const normalizedEmail = recipientEmail.trim().toLowerCase();
  const now = new Date();

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerifiedAt: true,
    },
  });

  if (!sender) {
    throw new Error("USER_NOT_FOUND");
  }

  if (!sender.emailVerifiedAt) {
    throw new Error("EMAIL_NOT_VERIFIED");
  }

  if (sender.email.toLowerCase() === normalizedEmail) {
    throw new Error("CANNOT_INVITE_SELF");
  }

  const activeBoardMembership = await prisma.boardMember.findFirst({
    where: {
      userId: senderId,
      status: "ACTIVE",
      board: {
        status: "ACTIVE",
      },
    },
    select: {
      id: true,
    },
  });

  if (activeBoardMembership) {
    throw new Error("SENDER_ALREADY_HAS_ACTIVE_BOARD");
  }

  const recipient = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
    },
  });

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const tokenEncrypted = encryptInvitationToken(token);

  const expiresAt = new Date(
    now.getTime() +
      INVITATION_EXPIRATION_HOURS * 60 * 60 * 1000,
  );

  let invitation;

  try {
    invitation = await prisma.$transaction(async (tx) => {
      const pendingInvitation = await tx.invitation.findFirst({
        where: {
          senderId,
          status: "PENDING",
        },
        select: {
          id: true,
          expiresAt: true,
        },
      });

      if (pendingInvitation) {
        if (pendingInvitation.expiresAt > now) {
          throw new Error("PENDING_INVITATION_ALREADY_EXISTS");
        }

        await tx.invitation.update({
          where: { id: pendingInvitation.id },
          data: {
            status: "EXPIRED",
            respondedAt: now,
          },
        });
      }

      return tx.invitation.create({
        data: {
          senderId,
          recipientId: recipient?.id ?? null,
          recipientEmail: normalizedEmail,
          tokenHash,
          tokenEncrypted,
          expiresAt,
        },
        select: {
          id: true,
          recipientEmail: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
      });
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new Error("PENDING_INVITATION_ALREADY_EXISTS", {
        cause: error,
      });
    }

    throw error;
  }

  const invitationUrl =
    `${env.FRONTEND_URL}/invitations/accept?token=${token}`;

  const safeSenderName = escapeHtml(sender.name);

  try {
    await mailer.sendMail({
      from: env.EMAIL_FROM,
      to: normalizedEmail,
      subject: "You've received an invitation to Us Love In Pics",
      text: [
        `Hello! ${sender.name} has invited you to join them on Us Love In Pics.`,
        `Accept the invitation using this link: ${invitationUrl}`,
        "This invitation expires in 72 hours.",
      ].join("\n\n"),
      html: `
        <h2>You've received an invitation!</h2>
        <p>Hello!</p>
        <p><strong>${safeSenderName}</strong> has invited you
        to join them on Us Love In Pics.</p>
        <p>
          <a href="${invitationUrl}">View invitation</a>
        </p>
        <p>This invitation expires in 72 hours.</p>
      `,
    });
  } catch (error) {
    await prisma.invitation.updateMany({
      where: {
        id: invitation.id,
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
        respondedAt: new Date(),
      },
    });

    throw new Error("EMAIL_DELIVERY_FAILED", {
      cause: error,
    });
  }

  return {
    message: "Invitation sent successfully",
    invitation: {
      id: invitation.id,
      recipientEmail: invitation.recipientEmail,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    },
  };
}


export async function resendInvitation(
  senderId: string,
  invitationId: string,
) {
  const invitation = await prisma.invitation.findFirst({
    where: {
      id: invitationId,
      senderId,
    },
    select: {
      id: true,
      recipientEmail: true,
      tokenEncrypted: true,
      status: true,
      expiresAt: true,
      updatedAt: true,
      sender: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!invitation) {
    throw new Error("INVITATION_NOT_FOUND");
  }

  if (invitation.status !== "PENDING") {
    throw new Error("INVITATION_NOT_PENDING");
  }

  const now = new Date();

  if (invitation.expiresAt <= now) {
    await prisma.invitation.updateMany({
      where: {
        id: invitation.id,
        status: "PENDING",
      },
      data: {
        status: "EXPIRED",
        respondedAt: now,
      },
    });

    throw new Error("INVITATION_EXPIRED");
  }

  const cooldownMilliseconds = RESEND_COOLDOWN_MINUTES * 60 * 1000;

  const nextResendAt = new Date(
    invitation.updatedAt.getTime() + cooldownMilliseconds,
  );

  if (nextResendAt > now) {
    throw new Error("RESEND_COOLDOWN_ACTIVE");
  }

  // Claim the resend cooldown atomically.
  const claimedInvitation = await prisma.invitation.updateMany({
    where: {
      id: invitation.id,
      senderId,
      status: "PENDING",
      expiresAt: { gt: now },
      updatedAt: { lte: new Date(now.getTime() - cooldownMilliseconds) },
    },
    data: {
      updatedAt: now,
    },
  });

  if (claimedInvitation.count !== 1) {
    throw new Error("RESEND_COOLDOWN_ACTIVE");
  }

  const token = decryptInvitationToken(invitation.tokenEncrypted,);

  const invitationUrl =`${env.FRONTEND_URL}/invitations/accept?token=${token}`;

  const safeSenderName = escapeHtml(invitation.sender.name);

  try {
    await mailer.sendMail({
      from: env.EMAIL_FROM,
      to: invitation.recipientEmail,
      subject: "Your Us Love In Pics invitation",
      text: [
        `${invitation.sender.name} has invited you to join them on Us Love In Pics.`,
        `View your invitation: ${invitationUrl}`,
        "This invitation expires in 72 hours from its original creation.",
      ].join("\n\n"),
      html: `
        <h2>Your invitation is waiting!</h2>
        <p><strong>${safeSenderName}</strong> has invited you
        to join them on Us Love In Pics.</p>
        <p>
          <a href="${invitationUrl}">View invitation</a>
        </p>
        <p>This invitation expires at its original expiration date.</p>
      `,
    });
  } catch (error) {
    throw new Error("EMAIL_DELIVERY_FAILED", {
      cause: error,
    });
  }

  return {
    message: "Invitation resent successfully",
    invitation: {
      id: invitation.id,
      recipientEmail: invitation.recipientEmail,
      expiresAt: invitation.expiresAt,
    },
    nextResendAt: new Date(
      now.getTime() + cooldownMilliseconds,
    ),
  };
}


export async function cancelInvitation(
  senderId: string,
  invitationId: string,
) {
  const now = new Date();

  const invitation = await prisma.invitation.findFirst({
    where: {
      id: invitationId,
      senderId,
    },
    select: {
      id: true,
      status: true,
      expiresAt: true,
    },
  });

  if (!invitation) {
    throw new Error("INVITATION_NOT_FOUND");
  }

  if (invitation.status !== "PENDING") {
    throw new Error("INVITATION_NOT_PENDING");
  }

  if (invitation.expiresAt <= now) {
    await prisma.invitation.updateMany({
      where: {
        id: invitation.id,
        status: "PENDING",
      },
      data: {
        status: "EXPIRED",
        respondedAt: now,
      },
    });

    throw new Error("INVITATION_EXPIRED");
  }

  const cancelledInvitation = await prisma.invitation.updateMany({
    where: {
      id: invitation.id,
      senderId,
      status: "PENDING",
      expiresAt: { gt: now },
    },
    data: {
      status: "CANCELLED",
      respondedAt: now,
    },
  });

  if (cancelledInvitation.count !== 1) {
    throw new Error("INVITATION_NOT_PENDING");
  }

  return {
    message: "Invitation cancelled successfully",
    invitationId: invitation.id,
  };
}

export async function listSentInvitations(senderId: string) {
  const now = new Date();

  // Mark expired pending invitations before retrieving the list.
  await prisma.invitation.updateMany({
    where: {
      senderId,
      status: "PENDING",
      expiresAt: { lte: now },
    },
    data: {
      status: "EXPIRED",
      respondedAt: now,
    },
  });

  const invitations = await prisma.invitation.findMany({
    where: {
      senderId,
    },
    select: {
      id: true,
      recipientEmail: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      respondedAt: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return {
    invitations,
  };
}

export async function listReceivedInvitations(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      emailVerifiedAt: true,
    },
  });

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  if (!user.emailVerifiedAt) {
    throw new Error("EMAIL_NOT_VERIFIED");
  }

  const normalizedEmail = user.email.trim().toLowerCase();
  const now = new Date();

  await prisma.invitation.updateMany({
    where: {
      recipientEmail: normalizedEmail,
      status: "PENDING",
      expiresAt: { lte: now },
    },
    data: {
      status: "EXPIRED",
      respondedAt: now,
    },
  });

  const invitations = await prisma.invitation.findMany({
    where: {
      recipientEmail: normalizedEmail,
    },
    select: {
      id: true,
      recipientEmail: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      respondedAt: true,
      createdAt: true,
      sender: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return { invitations };
}