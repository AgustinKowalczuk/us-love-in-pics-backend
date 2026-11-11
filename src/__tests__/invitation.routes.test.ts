import request from "supertest";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the mailer before importing the application.
vi.mock("../config/mailer.js", () => ({
  mailer: {
    sendMail: vi.fn(),
  },
}));

import { app } from "../app.js";
import { prisma } from "../config/prisma.js";
import { mailer } from "../config/mailer.js";
import { encryptInvitationToken } from "../modules/invitations/invitation-crypto.js";

const mockedSendMail = vi.mocked(mailer.sendMail);

async function cleanDatabase() {
  await prisma.memoryMedia.deleteMany();
  await prisma.memory.deleteMany();
  await prisma.boardMember.deleteMany();
  await prisma.board.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.user.deleteMany();
}

async function createVerifiedAgent(email = "agustin@example.com") {
  const agent = request.agent(app);

  const registration = await agent.post("/api/v1/auth/register").send({
    name: "Agustin",
    email,
    password: "MyPassword123!",
  });

  expect(registration.status).toBe(201);

  const user = await prisma.user.update({
    where: { email },
    data: {
      emailVerifiedAt: new Date(),
    },
  });

  return { agent, user };
}

async function createPendingInvitation(
  senderId: string,
  token = "test-invitation-token",
) {
  const oldDate = new Date(Date.now() - 10 * 60 * 1000);

  return prisma.invitation.create({
    data: {
      senderId,
      recipientEmail: "mayra@example.com",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      tokenEncrypted: encryptInvitationToken(token),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      createdAt: oldDate,
      updatedAt: oldDate,
    },
  });
}

beforeEach(async () => {
  await cleanDatabase();
  vi.clearAllMocks();
  mockedSendMail.mockResolvedValue({} as never);
});

describe("Invitation routes", () => {
  describe("POST /api/v1/invitations", () => {
    it("creates an invitation for a verified user", async () => {
      const { agent } = await createVerifiedAgent();

      const response = await agent.post("/api/v1/invitations").send({
        recipientEmail: "mayra@example.com",
      });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("success");
      expect(response.body.data.invitation.recipientEmail).toBe(
        "mayra@example.com",
      );

      expect(mockedSendMail).toHaveBeenCalledOnce();
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app).post("/api/v1/invitations").send({
        recipientEmail: "mayra@example.com",
      });

      expect(response.status).toBe(401);
      expect(mockedSendMail).not.toHaveBeenCalled();
    });

    it("rejects users with unverified email addresses", async () => {
      const agent = request.agent(app);

      await agent.post("/api/v1/auth/register").send({
        name: "Agustin",
        email: "agustin@example.com",
        password: "MyPassword123!",
      });

      const response = await agent.post("/api/v1/invitations").send({
        recipientEmail: "mayra@example.com",
      });

      expect(response.status).toBe(403);
      expect(mockedSendMail).not.toHaveBeenCalled();
    });

    it("rejects invalid request bodies", async () => {
      const { agent } = await createVerifiedAgent();

      const response = await agent.post("/api/v1/invitations").send({
        recipientEmail: "invalid-email",
      });

      expect(response.status).toBe(400);
      expect(mockedSendMail).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/invitations/:id/resend", () => {
    it("resends a pending invitation", async () => {
      const { agent, user } = await createVerifiedAgent();

      const invitation = await createPendingInvitation(user.id);

      const response = await agent.post(
        `/api/v1/invitations/${invitation.id}/resend`,
      );

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("success");
      expect(response.body.data.invitation.id).toBe(invitation.id);
      expect(response.body.data.nextResendAt).toBeDefined();

      expect(mockedSendMail).toHaveBeenCalledOnce();
    });

    it("rejects requests while the resend cooldown is active", async () => {
      const { agent, user } = await createVerifiedAgent();

      const invitation = await prisma.invitation.create({
        data: {
          senderId: user.id,
          recipientEmail: "mayra@example.com",
          tokenHash: createHash("sha256")
            .update("cooldown-token")
            .digest("hex"),
          tokenEncrypted: encryptInvitationToken("cooldown-token"),
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        },
      });

      const response = await agent.post(
        `/api/v1/invitations/${invitation.id}/resend`,
      );

      expect(response.status).toBe(429);
      expect(mockedSendMail).not.toHaveBeenCalled();
    });

    it("rejects invalid invitation IDs", async () => {
      const { agent } = await createVerifiedAgent();

      const response = await agent.post(
        "/api/v1/invitations/invalid-id/resend",
      );

      expect(response.status).toBe(400);
      expect(mockedSendMail).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/v1/invitations/:id", () => {
    it("cancels a pending invitation", async () => {
      const { agent, user } = await createVerifiedAgent();

      const invitation = await createPendingInvitation(user.id);

      const response = await agent.delete(
        `/api/v1/invitations/${invitation.id}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("success");
      expect(response.body.data.invitationId).toBe(invitation.id);

      const savedInvitation = await prisma.invitation.findUnique({
        where: { id: invitation.id },
      });

      expect(savedInvitation?.status).toBe("CANCELLED");
      expect(savedInvitation?.respondedAt).not.toBeNull();
    });

    it("returns 404 when the invitation does not exist", async () => {
      const { agent } = await createVerifiedAgent();

      const response = await agent.delete(
        "/api/v1/invitations/00000000-0000-4000-8000-000000000000",
      );

      expect(response.status).toBe(404);
    });
  });
});
