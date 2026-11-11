import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

// Mock the mailer before importing the invitation service.
vi.mock("../config/mailer.js", () => ({
  mailer: {
    sendMail: vi.fn(),
  },
}));

import { prisma } from "../config/prisma.js";
import { mailer } from "../config/mailer.js";
import {
  createInvitation,
  resendInvitation,
  cancelInvitation,
  listSentInvitations,
  listReceivedInvitations
} from "../modules/invitations/invitation.service.js";
import { encryptInvitationToken } from "../modules/invitations/invitation-crypto.js";

const mockedSendMail = vi.mocked(mailer.sendMail);
const TEST_INVITATION_TOKEN = "test-invitation-token";

async function createVerifiedUser(email = "agustin@example.com") {
  return prisma.user.create({
    data: {
      name: "Agustin",
      email,
      passwordHash: "test-password-hash",
      emailVerifiedAt: new Date(),
    },
  });
}

async function createActiveBoard(userId: string) {
  const board = await prisma.board.create({
    data: {
      name: "Agustin&Mayra",
    },
  });

  await prisma.boardMember.create({
    data: {
      boardId: board.id,
      userId,
      role: "OWNER",
    },
  });

  return board;
}

async function createPendingInvitation(
  senderId: string,
  options?: {
    recipientEmail?: string;
    expiresAt?: Date;
    updatedAt?: Date;
    token?: string;
  },
) {
  const createdAt = new Date(Date.now() - 10 * 60 * 1000);
  const token = options?.token ?? TEST_INVITATION_TOKEN;

  return prisma.invitation.create({
    data: {
      senderId,
      recipientEmail: options?.recipientEmail ?? "mayra@example.com",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      tokenEncrypted: encryptInvitationToken(token),
      expiresAt:
        options?.expiresAt ?? new Date(Date.now() + 72 * 60 * 60 * 1000),
      createdAt,
      updatedAt: options?.updatedAt ?? createdAt,
    },
  });
}

async function cleanDatabase() {
  await prisma.memoryMedia.deleteMany();
  await prisma.memory.deleteMany();
  await prisma.boardMember.deleteMany();
  await prisma.board.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.user.deleteMany();
}

beforeEach(async () => {
  await cleanDatabase();
  vi.clearAllMocks();
  mockedSendMail.mockResolvedValue({} as never);
});

describe("Invitation service", () => {
  describe("createInvitation", () => {
    it("creates an invitation and sends an email", async () => {
      const sender = await createVerifiedUser();

      const result = await createInvitation(sender.id, "mayra@example.com");

      expect(result.message).toBe("Invitation sent successfully");
      expect(result.invitation.recipientEmail).toBe("mayra@example.com");
      expect(result.invitation.status).toBe("PENDING");

      expect(mockedSendMail).toHaveBeenCalledOnce();

      const savedInvitation = await prisma.invitation.findUnique({
        where: { id: result.invitation.id },
      });

      expect(savedInvitation).not.toBeNull();
      expect(savedInvitation?.tokenHash).toHaveLength(64);
      expect(savedInvitation?.tokenEncrypted).toContain("v1.");
      expect(savedInvitation?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("rejects when the sender does not exist", async () => {
      await expect(
        createInvitation(
          "00000000-0000-4000-8000-000000000000",
          "mayra@example.com",
        ),
      ).rejects.toThrow("USER_NOT_FOUND");

      expect(mockedSendMail).not.toHaveBeenCalled();
    });

    it("rejects when the sender email is not verified", async () => {
      const sender = await prisma.user.create({
        data: {
          name: "Agustin",
          email: "agustin@example.com",
          passwordHash: "test-password-hash",
        },
      });

      await expect(
        createInvitation(sender.id, "mayra@example.com"),
      ).rejects.toThrow("EMAIL_NOT_VERIFIED");

      expect(mockedSendMail).not.toHaveBeenCalled();
    });

    it("rejects when the sender invites their own email", async () => {
      const sender = await createVerifiedUser();

      await expect(
        createInvitation(sender.id, "AGUSTIN@example.com"),
      ).rejects.toThrow("CANNOT_INVITE_SELF");

      expect(mockedSendMail).not.toHaveBeenCalled();
    });

    it("rejects when the sender already has an active board", async () => {
      const sender = await createVerifiedUser();

      await createActiveBoard(sender.id);

      await expect(
        createInvitation(sender.id, "mayra@example.com"),
      ).rejects.toThrow("SENDER_ALREADY_HAS_ACTIVE_BOARD");

      expect(mockedSendMail).not.toHaveBeenCalled();
    });

    it("rejects when a pending invitation already exists", async () => {
      const sender = await createVerifiedUser();

      await createInvitation(sender.id, "mayra@example.com");

      await expect(
        createInvitation(sender.id, "another@example.com"),
      ).rejects.toThrow("PENDING_INVITATION_ALREADY_EXISTS");

      expect(mockedSendMail).toHaveBeenCalledOnce();
    });

    it("expires an old pending invitation before creating a new one", async () => {
      const sender = await createVerifiedUser();

      const oldInvitation = await prisma.invitation.create({
        data: {
          senderId: sender.id,
          recipientEmail: "old@example.com",
          tokenHash: "a".repeat(64),
          tokenEncrypted: "v1.test.test.test",
          expiresAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      });

      const result = await createInvitation(sender.id, "mayra@example.com");

      const updatedOldInvitation = await prisma.invitation.findUnique({
        where: { id: oldInvitation.id },
      });

      expect(updatedOldInvitation?.status).toBe("EXPIRED");
      expect(updatedOldInvitation?.respondedAt).not.toBeNull();

      expect(result.invitation.status).toBe("PENDING");
      expect(mockedSendMail).toHaveBeenCalledOnce();
    });

    it("cancels the invitation when email delivery fails", async () => {
      const sender = await createVerifiedUser();

      mockedSendMail.mockRejectedValueOnce(new Error("SMTP connection failed"));

      await expect(
        createInvitation(sender.id, "mayra@example.com"),
      ).rejects.toThrow("EMAIL_DELIVERY_FAILED");

      const savedInvitation = await prisma.invitation.findFirst({
        where: {
          senderId: sender.id,
        },
      });

      expect(savedInvitation?.status).toBe("CANCELLED");
      expect(savedInvitation?.respondedAt).not.toBeNull();
    });
  });
});

describe("resendInvitation", () => {
  it("resends an invitation using the same token", async () => {
    const sender = await createVerifiedUser();

    const invitation = await createPendingInvitation(sender.id);

    const result = await resendInvitation(sender.id, invitation.id);

    expect(result.message).toBe("Invitation resent successfully");
    expect(result.invitation.id).toBe(invitation.id);
    expect(result.invitation.expiresAt).toEqual(invitation.expiresAt);

    expect(result.nextResendAt.getTime()).toBeGreaterThan(Date.now());

    expect(mockedSendMail).toHaveBeenCalledOnce();
    expect(mockedSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "mayra@example.com",
        text: expect.stringContaining(TEST_INVITATION_TOKEN),
      }),
    );

    const savedInvitation = await prisma.invitation.findUnique({
      where: { id: invitation.id },
    });

    expect(savedInvitation?.expiresAt).toEqual(invitation.expiresAt);
  });

  it("rejects when the resend cooldown is active", async () => {
    const sender = await createVerifiedUser();

    const invitation = await createPendingInvitation(sender.id, {
      updatedAt: new Date(),
    });

    await expect(resendInvitation(sender.id, invitation.id)).rejects.toThrow(
      "RESEND_COOLDOWN_ACTIVE",
    );

    expect(mockedSendMail).not.toHaveBeenCalled();
  });

  it("marks an expired invitation as expired", async () => {
    const sender = await createVerifiedUser();

    const invitation = await createPendingInvitation(sender.id, {
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    await expect(resendInvitation(sender.id, invitation.id)).rejects.toThrow(
      "INVITATION_EXPIRED",
    );

    const savedInvitation = await prisma.invitation.findUnique({
      where: { id: invitation.id },
    });

    expect(savedInvitation?.status).toBe("EXPIRED");
    expect(savedInvitation?.respondedAt).not.toBeNull();

    expect(mockedSendMail).not.toHaveBeenCalled();
  });

  it("rejects when the invitation does not belong to the sender", async () => {
    const sender = await createVerifiedUser();
    const anotherSender = await createVerifiedUser("other@example.com");

    const invitation = await createPendingInvitation(sender.id);

    await expect(
      resendInvitation(anotherSender.id, invitation.id),
    ).rejects.toThrow("INVITATION_NOT_FOUND");

    expect(mockedSendMail).not.toHaveBeenCalled();
  });

  it("rejects when the invitation is not pending", async () => {
    const sender = await createVerifiedUser();

    const invitation = await createPendingInvitation(sender.id);

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: "CANCELLED",
        respondedAt: new Date(),
      },
    });

    await expect(resendInvitation(sender.id, invitation.id)).rejects.toThrow(
      "INVITATION_NOT_PENDING",
    );

    expect(mockedSendMail).not.toHaveBeenCalled();
  });

  it("rejects when email delivery fails", async () => {
    const sender = await createVerifiedUser();

    const invitation = await createPendingInvitation(sender.id);

    mockedSendMail.mockRejectedValueOnce(new Error("SMTP connection failed"));

    await expect(resendInvitation(sender.id, invitation.id)).rejects.toThrow(
      "EMAIL_DELIVERY_FAILED",
    );

    const savedInvitation = await prisma.invitation.findUnique({
      where: { id: invitation.id },
    });

    // A failed resend must not cancel the original invitation.
    expect(savedInvitation?.status).toBe("PENDING");
  });
});

describe("cancelInvitation", () => {
  it("cancels a pending invitation", async () => {
    const sender = await createVerifiedUser();

    const invitation = await createPendingInvitation(sender.id);

    const result = await cancelInvitation(sender.id, invitation.id);

    expect(result.message).toBe("Invitation cancelled successfully");
    expect(result.invitationId).toBe(invitation.id);

    const savedInvitation = await prisma.invitation.findUnique({
      where: { id: invitation.id },
    });

    expect(savedInvitation?.status).toBe("CANCELLED");
    expect(savedInvitation?.respondedAt).not.toBeNull();
  });

  it("rejects when the invitation does not belong to the sender", async () => {
    const sender = await createVerifiedUser();
    const anotherSender = await createVerifiedUser("other@example.com");

    const invitation = await createPendingInvitation(sender.id);

    await expect(
      cancelInvitation(anotherSender.id, invitation.id),
    ).rejects.toThrow("INVITATION_NOT_FOUND");
  });

  it("rejects when the invitation is already responded", async () => {
    const sender = await createVerifiedUser();

    const invitation = await createPendingInvitation(sender.id);

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        respondedAt: new Date(),
      },
    });

    await expect(cancelInvitation(sender.id, invitation.id)).rejects.toThrow(
      "INVITATION_NOT_PENDING",
    );
  });

  it("marks an expired invitation as expired", async () => {
    const sender = await createVerifiedUser();

    const invitation = await createPendingInvitation(sender.id, {
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    await expect(cancelInvitation(sender.id, invitation.id)).rejects.toThrow(
      "INVITATION_EXPIRED",
    );

    const savedInvitation = await prisma.invitation.findUnique({
      where: { id: invitation.id },
    });

    expect(savedInvitation?.status).toBe("EXPIRED");
    expect(savedInvitation?.respondedAt).not.toBeNull();
  });
});

describe("listSentInvitations", () => {
  it("returns all invitations sent by the user", async () => {
    const sender = await createVerifiedUser();

    const pendingInvitation = await createPendingInvitation(sender.id);

    const acceptedInvitation = await prisma.invitation.create({
      data: {
        senderId: sender.id,
        recipientEmail: "accepted@example.com",
        tokenHash: "a".repeat(64),
        tokenEncrypted: "v1.test.test.test",
        status: "ACCEPTED",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        acceptedAt: new Date(),
        respondedAt: new Date(),
      },
    });

    const anotherSender = await createVerifiedUser("other@example.com");

    await createPendingInvitation(anotherSender.id, {
      token: "another-test-invitation-token",
    });

    const result = await listSentInvitations(sender.id);

    expect(result.invitations).toHaveLength(2);

    const invitationIds = result.invitations.map((invitation) => invitation.id);

    expect(invitationIds).toContain(pendingInvitation.id);
    expect(invitationIds).toContain(acceptedInvitation.id);

    expect(result.invitations[0].createdAt.getTime()).toBeGreaterThanOrEqual(
      result.invitations[1].createdAt.getTime(),
    );
  });

  it("marks expired pending invitations as expired", async () => {
    const sender = await createVerifiedUser();

    const invitation = await createPendingInvitation(sender.id, {
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    const result = await listSentInvitations(sender.id);

    expect(result.invitations).toHaveLength(1);
    expect(result.invitations[0].status).toBe("EXPIRED");

    const savedInvitation = await prisma.invitation.findUnique({
      where: { id: invitation.id },
    });

    expect(savedInvitation?.status).toBe("EXPIRED");
    expect(savedInvitation?.respondedAt).not.toBeNull();
  });

  it("does not expose sensitive invitation data", async () => {
    const sender = await createVerifiedUser();

    await createPendingInvitation(sender.id);

    const result = await listSentInvitations(sender.id);

    const invitation = result.invitations[0];

    expect(invitation).toHaveProperty("recipientEmail");
    expect(invitation).toHaveProperty("status");

    expect(invitation).not.toHaveProperty("recipientId");
    expect(invitation).not.toHaveProperty("tokenHash");
    expect(invitation).not.toHaveProperty("tokenEncrypted");
    expect(invitation).not.toHaveProperty("sender");
  });

  it("returns an empty list when the user has no invitations", async () => {
    const sender = await createVerifiedUser();

    const result = await listSentInvitations(sender.id);

    expect(result.invitations).toEqual([]);
  });
});

describe("listReceivedInvitations", () => {
  it("returns invitations addressed to the user's verified email", async () => {
    const recipient = await createVerifiedUser("mayra@example.com");

    const sender = await createVerifiedUser("agustin@example.com");
    const anotherSender = await createVerifiedUser("other@example.com");

    const receivedInvitation = await createPendingInvitation(sender.id, {
      recipientEmail: recipient.email,
      token: "received-invitation-token",
    });

    await createPendingInvitation(anotherSender.id, {
      recipientEmail: "someone@example.com",
      token: "another-recipient-token",
    });

    const result = await listReceivedInvitations(recipient.id);

    expect(result.invitations).toHaveLength(1);
    expect(result.invitations[0].id).toBe(receivedInvitation.id);
    expect(result.invitations[0].recipientEmail).toBe(recipient.email);
  });

  it("finds invitations when recipientId is null", async () => {
    const recipient = await createVerifiedUser("mayra@example.com");
    const sender = await createVerifiedUser("agustin@example.com");

    const invitation = await createPendingInvitation(sender.id, {
      recipientEmail: recipient.email,
      token: "invitation-without-recipient-id",
    });

    const result = await listReceivedInvitations(recipient.id);

    expect(result.invitations).toHaveLength(1);
    expect(result.invitations[0].id).toBe(invitation.id);

    const savedInvitation = await prisma.invitation.findUnique({
      where: { id: invitation.id },
    });

    expect(savedInvitation?.recipientId).toBeNull();
  });

  it("marks expired pending invitations as expired", async () => {
    const recipient = await createVerifiedUser("mayra@example.com");
    const sender = await createVerifiedUser("agustin@example.com");

    const invitation = await createPendingInvitation(sender.id, {
      recipientEmail: recipient.email,
      expiresAt: new Date(Date.now() - 60 * 1000),
      token: "expired-received-invitation",
    });

    const result = await listReceivedInvitations(recipient.id);

    expect(result.invitations).toHaveLength(1);
    expect(result.invitations[0].status).toBe("EXPIRED");

    const savedInvitation = await prisma.invitation.findUnique({
      where: { id: invitation.id },
    });

    expect(savedInvitation?.status).toBe("EXPIRED");
    expect(savedInvitation?.respondedAt).not.toBeNull();
  });

  it("rejects users with unverified email addresses", async () => {
    const user = await prisma.user.create({
      data: {
        name: "Mayra",
        email: "mayra@example.com",
        passwordHash: "test-password-hash",
      },
    });

    await expect(listReceivedInvitations(user.id)).rejects.toThrow(
      "EMAIL_NOT_VERIFIED",
    );
  });

  it("returns an empty list when the user has no received invitations", async () => {
    const recipient = await createVerifiedUser("mayra@example.com");

    const result = await listReceivedInvitations(recipient.id);

    expect(result.invitations).toEqual([]);
  });

  it("does not expose sensitive invitation data", async () => {
    const recipient = await createVerifiedUser("mayra@example.com");
    const sender = await createVerifiedUser("agustin@example.com");

    await createPendingInvitation(sender.id, {
      recipientEmail: recipient.email,
      token: "sensitive-data-test-token",
    });

    const result = await listReceivedInvitations(recipient.id);
    const invitation = result.invitations[0];

    expect(invitation).toHaveProperty("sender.name");

    expect(invitation).not.toHaveProperty("recipientId");
    expect(invitation).not.toHaveProperty("tokenHash");
    expect(invitation).not.toHaveProperty("tokenEncrypted");
  });
});
