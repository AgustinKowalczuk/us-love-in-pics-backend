import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../config/prisma.js";
import { encryptInvitationToken } from "../modules/invitations/invitation-crypto.js";
import { createBoard, getMyActiveBoard, archiveBoard, getBoardById} from "../modules/boards/board.service.js";

import request from "supertest";
import { app } from "../app.js";

/**
 * Cleans database tables before each test.
 */
async function cleanDatabase() {
  await prisma.memoryMedia.deleteMany();
  await prisma.memory.deleteMany();
  await prisma.boardMember.deleteMany();
  await prisma.board.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Creates a registered user and optionally verifies their email.
 */
async function createUser(name: string, email: string, verified = true) {
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: "test-password-hash",
      emailVerifiedAt: verified ? new Date() : null,
    },
  });

  return user;
}

/**
 * Creates an accepted invitation between two users.
 */
async function createAcceptedInvitation(
  senderId: string,
  recipientId: string | null,
) {
  const token = randomUUID();
  const now = new Date();

  return prisma.invitation.create({
    data: {
      senderId,
      recipientId,
      recipientEmail: recipientId
        ? (
            await prisma.user.findUniqueOrThrow({
              where: { id: recipientId },
              select: { email: true },
            })
          ).email
        : "recipient@example.com",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      tokenEncrypted: encryptInvitationToken(token),
      status: "ACCEPTED",
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      acceptedAt: now,
      respondedAt: now,
    },
  });
}

/**
 * Creates an active board membership for a user.
 */
async function createActiveBoard(userId: string) {
  const board = await prisma.board.create({
    data: {
      name: "Existing&Partner",
      status: "ACTIVE",
    },
  });

  await prisma.boardMember.create({
    data: {
      boardId: board.id,
      userId,
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  return board;
}

/**
 * Creates a board with an owner and a partner.
 */
async function createBoardWithMembers(
  ownerId: string,
  partnerId: string,
  status: "ACTIVE" | "ARCHIVED" = "ACTIVE",
) {
  const board = await prisma.board.create({
    data: {
      name: "Agustin&Mayra",
      status,
      archivedAt: status === "ARCHIVED" ? new Date() : null,
      members: {
        create: [
          {
            userId: ownerId,
            role: "OWNER",
            status,
            archivedAt: status === "ARCHIVED" ? new Date() : null,
          },
          {
            userId: partnerId,
            role: "PARTNER",
            status,
            archivedAt: status === "ARCHIVED" ? new Date() : null,
          },
        ],
      },
    },
  });

  return board;
}

/**
 * Registers a user and returns an authenticated agent.
 */
async function createAuthenticatedUser(
  name: string,
  email: string,
  verified = true,
) {
  const agent = request.agent(app);

  const registration = await agent.post("/api/v1/auth/register").send({
    name,
    email,
    password: "MyPassword123!",
  });

  if (registration.status !== 201) {
    throw new Error(`User registration failed: ${registration.status}`);
  }

  let user = await prisma.user.findUniqueOrThrow({
    where: { email },
  });

  if (verified) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
  }

  return { agent, user };
}

beforeEach(async () => {
  await cleanDatabase();
});

describe("Board module", () => {
  describe("Board service - createBoard()", () => {
    it("creates a board with the sender and recipient as members", async () => {
      const sender = await createUser("Agustin", "agustin@example.com");
      const recipient = await createUser("Mayra", "mayra@example.com");

      const invitation = await createAcceptedInvitation(
        sender.id,
        recipient.id,
      );

      const board = await createBoard(sender.id, invitation.id);

      expect(board.name).toBe("Agustin&Mayra");
      expect(board.status).toBe("ACTIVE");
      expect(board.photoLimit).toBe(15);
      expect(board.invitationId).toBe(invitation.id);
      expect(board.archivedAt).toBeNull();

      expect(board.members).toHaveLength(2);

      const owner = board.members.find((member) => member.userId === sender.id);

      const partner = board.members.find(
        (member) => member.userId === recipient.id,
      );

      expect(owner).toBeDefined();
      expect(owner?.role).toBe("OWNER");
      expect(owner?.status).toBe("ACTIVE");

      expect(partner).toBeDefined();
      expect(partner?.role).toBe("PARTNER");
      expect(partner?.status).toBe("ACTIVE");
    });

    it("throws an error when the invitation does not exist", async () => {
      const sender = await createUser("Agustin", "agustin@example.com");

      await expect(
        createBoard(sender.id, "00000000-0000-4000-8000-000000000000"),
      ).rejects.toThrow("INVITATION_NOT_FOUND");
    });

    it("throws an error when the invitation has not been accepted", async () => {
      const sender = await createUser("Agustin", "agustin@example.com");
      const recipient = await createUser("Mayra", "mayra@example.com");

      const token = randomUUID();

      const invitation = await prisma.invitation.create({
        data: {
          senderId: sender.id,
          recipientId: recipient.id,
          recipientEmail: recipient.email,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          tokenEncrypted: encryptInvitationToken(token),
          status: "PENDING",
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        },
      });

      await expect(createBoard(sender.id, invitation.id)).rejects.toThrow(
        "INVITATION_NOT_ACCEPTED",
      );
    });

    it("rejects users who are not the invitation sender", async () => {
      const sender = await createUser("Agustin", "agustin@example.com");
      const recipient = await createUser("Mayra", "mayra@example.com");

      const invitation = await createAcceptedInvitation(
        sender.id,
        recipient.id,
      );

      await expect(createBoard(recipient.id, invitation.id)).rejects.toThrow(
        "NOT_INVITATION_SENDER",
      );
    });

    it("rejects invitations without an associated recipient", async () => {
      const sender = await createUser("Agustin", "agustin@example.com");

      const invitation = await createAcceptedInvitation(sender.id, null);

      await expect(createBoard(sender.id, invitation.id)).rejects.toThrow(
        "INVITATION_RECIPIENT_NOT_FOUND",
      );
    });

    it("rejects board creation when the sender email is not verified", async () => {
      const sender = await createUser("Agustin", "agustin@example.com", false);

      const recipient = await createUser("Mayra", "mayra@example.com");

      const invitation = await createAcceptedInvitation(
        sender.id,
        recipient.id,
      );

      await expect(createBoard(sender.id, invitation.id)).rejects.toThrow(
        "EMAIL_NOT_VERIFIED",
      );
    });

    it("rejects board creation when the recipient email is not verified", async () => {
      const sender = await createUser("Agustin", "agustin@example.com");

      const recipient = await createUser("Mayra", "mayra@example.com", false);

      const invitation = await createAcceptedInvitation(
        sender.id,
        recipient.id,
      );

      await expect(createBoard(sender.id, invitation.id)).rejects.toThrow(
        "EMAIL_NOT_VERIFIED",
      );
    });

    it("rejects board creation when the sender already has an active board", async () => {
      const sender = await createUser("Agustin", "agustin@example.com");
      const recipient = await createUser("Mayra", "mayra@example.com");

      const invitation = await createAcceptedInvitation(
        sender.id,
        recipient.id,
      );

      await createActiveBoard(sender.id);

      await expect(createBoard(sender.id, invitation.id)).rejects.toThrow(
        "USER_ALREADY_HAS_ACTIVE_BOARD",
      );
    });

    it("rejects board creation when the recipient already has an active board", async () => {
      const sender = await createUser("Agustin", "agustin@example.com");
      const recipient = await createUser("Mayra", "mayra@example.com");

      const invitation = await createAcceptedInvitation(
        sender.id,
        recipient.id,
      );

      await createActiveBoard(recipient.id);

      await expect(createBoard(sender.id, invitation.id)).rejects.toThrow(
        "USER_ALREADY_HAS_ACTIVE_BOARD",
      );
    });

    it("rejects creating a second board from the same invitation", async () => {
      const sender = await createUser("Agustin", "agustin@example.com");
      const recipient = await createUser("Mayra", "mayra@example.com");

      const invitation = await createAcceptedInvitation(
        sender.id,
        recipient.id,
      );

      await prisma.board.create({
        data: {
          name: "Agustin&Mayra",
          invitationId: invitation.id,
        },
      });

      await expect(createBoard(sender.id, invitation.id)).rejects.toThrow(
        "BOARD_ALREADY_EXISTS",
      );
    });
  });
});

describe("Board service - getMyActiveBoard()", () => {
  it("retrieves the user's active board with its active members", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    const result = await getMyActiveBoard(owner.id);

    expect(result.id).toBe(board.id);
    expect(result.name).toBe("Agustin&Mayra");
    expect(result.status).toBe("ACTIVE");
    expect(result.members).toHaveLength(2);

    const resultOwner = result.members.find(
      (member) => member.userId === owner.id,
    );

    const resultPartner = result.members.find(
      (member) => member.userId === partner.id,
    );

    expect(resultOwner?.role).toBe("OWNER");
    expect(resultOwner?.user.name).toBe("Agustin");

    expect(resultPartner?.role).toBe("PARTNER");
    expect(resultPartner?.user.name).toBe("Mayra");
  });

  it("throws an error when the user has no active board", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(getMyActiveBoard(user.id)).rejects.toThrow(
      "ACTIVE_BOARD_NOT_FOUND",
    );
  });

  it("does not retrieve an archived board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");

    await createBoardWithMembers(owner.id, partner.id, "ARCHIVED");

    await expect(getMyActiveBoard(owner.id)).rejects.toThrow(
      "ACTIVE_BOARD_NOT_FOUND",
    );
  });
});

describe("Board service - archiveBoard()", () => {
  it("archives the board and all its active memberships as the owner", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    const result = await archiveBoard(owner.id, board.id);

    expect(result.status).toBe("ARCHIVED");
    expect(result.archivedAt).toBeInstanceOf(Date);
    expect(result.members).toHaveLength(2);

    for (const member of result.members) {
      expect(member.status).toBe("ARCHIVED");
      expect(member.archivedAt).toBeInstanceOf(Date);
    }

    expect(result.members[0].archivedAt?.getTime()).toBe(
      result.archivedAt?.getTime(),
    );

    expect(result.members[1].archivedAt?.getTime()).toBe(
      result.archivedAt?.getTime(),
    );
  });

  it("allows the partner to archive the board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    const result = await archiveBoard(partner.id, board.id);

    expect(result.status).toBe("ARCHIVED");
    expect(result.archivedAt).toBeInstanceOf(Date);
    expect(result.members.every(
      (member) => member.status === "ARCHIVED",
    )).toBe(true);
  });

  it("rejects users who are not active members of the board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const outsider = await createUser("Lucas", "lucas@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    await expect(archiveBoard(outsider.id, board.id)).rejects.toThrow(
      "NOT_BOARD_MEMBER",
    );
  });

  it("throws an error when the board does not exist", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(
      archiveBoard(user.id, randomUUID()),
    ).rejects.toThrow("BOARD_NOT_FOUND");
  });

  it("rejects archiving a board that is already archived", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");

    const board = await createBoardWithMembers(
      owner.id,
      partner.id,
      "ARCHIVED",
    );

    await expect(archiveBoard(owner.id, board.id)).rejects.toThrow(
      "BOARD_NOT_FOUND",
    );
  });
});

describe("Board service - getBoardById()", () => {
  it("retrieves an active board for its owner", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    const result = await getBoardById(owner.id, board.id);

    expect(result.id).toBe(board.id);
    expect(result.name).toBe("Agustin&Mayra");
    expect(result.status).toBe("ACTIVE");
    expect(result.members).toHaveLength(2);
  });

  it("retrieves an active board for its partner", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    const result = await getBoardById(partner.id, board.id);

    expect(result.id).toBe(board.id);
    expect(result.status).toBe("ACTIVE");
    expect(result.members).toHaveLength(2);
  });

  it("rejects users who are not active members of the board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const outsider = await createUser("Lucas", "lucas@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    await expect(
      getBoardById(outsider.id, board.id),
    ).rejects.toThrow("NOT_BOARD_MEMBER");
  });

  it("throws an error when the board does not exist", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(
      getBoardById(user.id, randomUUID()),
    ).rejects.toThrow("BOARD_NOT_FOUND");
  });

  it("does not retrieve an archived board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");

    const board = await createBoardWithMembers(
      owner.id,
      partner.id,
      "ARCHIVED",
    );

    await expect(
      getBoardById(owner.id, board.id),
    ).rejects.toThrow("BOARD_NOT_FOUND");
  });
});

describe("Board routes - POST /api/v1/boards", () => {
  it("creates a board from an accepted invitation", async () => {
    const { agent, user: sender } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const recipient = await createUser("Mayra", "mayra@example.com");

    const invitation = await createAcceptedInvitation(sender.id, recipient.id);

    const response = await agent.post("/api/v1/boards").send({
      invitationId: invitation.id,
    });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("success");
    expect(response.body.data.board.name).toBe("Agustin&Mayra");
    expect(response.body.data.board.invitationId).toBe(invitation.id);
    expect(response.body.data.board.members).toHaveLength(2);
  });

  it("rejects requests without an authenticated session", async () => {
    const response = await request(app).post("/api/v1/boards").send({
      invitationId: randomUUID(),
    });

    expect(response.status).toBe(401);
  });

  it("rejects requests with an invalid invitation ID", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent.post("/api/v1/boards").send({
      invitationId: "invalid-id",
    });

    expect(response.status).toBe(400);
  });

  it("rejects users with unverified email addresses", async () => {
    const { agent, user: sender } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
      false,
    );

    const recipient = await createUser("Mayra", "mayra@example.com");

    const invitation = await createAcceptedInvitation(sender.id, recipient.id);

    const response = await agent.post("/api/v1/boards").send({
      invitationId: invitation.id,
    });

    expect(response.status).toBe(403);
  });

  it("returns 404 when the invitation does not exist", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent.post("/api/v1/boards").send({
      invitationId: randomUUID(),
    });

    expect(response.status).toBe(404);
  });

  it("returns 409 when the invitation has not been accepted", async () => {
    const { agent, user: sender } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const recipient = await createUser("Mayra", "mayra@example.com");

    const invitation = await createAcceptedInvitation(sender.id, recipient.id);

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: "PENDING",
        acceptedAt: null,
        respondedAt: null,
      },
    });

    const response = await agent.post("/api/v1/boards").send({
      invitationId: invitation.id,
    });

    expect(response.status).toBe(409);
  });

  it("rejects users who are not the invitation sender", async () => {
    const { agent, user: recipient } = await createAuthenticatedUser(
      "Mayra",
      "mayra@example.com",
    );

    const sender = await createUser("Agustin", "agustin@example.com");

    const invitation = await createAcceptedInvitation(sender.id, recipient.id);

    const response = await agent.post("/api/v1/boards").send({
      invitationId: invitation.id,
    });

    expect(response.status).toBe(403);
  });

  it("returns 409 when the sender already has an active board", async () => {
    const { agent, user: sender } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const recipient = await createUser("Mayra", "mayra@example.com");

    const invitation = await createAcceptedInvitation(sender.id, recipient.id);

    await createActiveBoard(sender.id);

    const response = await agent.post("/api/v1/boards").send({
      invitationId: invitation.id,
    });

    expect(response.status).toBe(409);
  });
});

describe("Board routes - GET /api/v1/boards/me", () => {
  it("retrieves the active board for the owner", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    const response = await agent.get("/api/v1/boards/me");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data.board.id).toBe(board.id);
    expect(response.body.data.board.name).toBe("Agustin&Mayra");
    expect(response.body.data.board.members).toHaveLength(2);
  });

  it("retrieves the active board for the partner", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");

    const { agent, user: partner } = await createAuthenticatedUser(
      "Mayra",
      "mayra@example.com",
    );

    const board = await createBoardWithMembers(owner.id, partner.id);

    const response = await agent.get("/api/v1/boards/me");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data.board.id).toBe(board.id);
    expect(response.body.data.board.members).toHaveLength(2);
  });

  it("returns 404 when the user has no active board", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent.get("/api/v1/boards/me");

    expect(response.status).toBe(404);
    expect(response.body.status).toBe("error");
  });

  it("returns 404 when the user's board is archived", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");

    await createBoardWithMembers(owner.id, partner.id, "ARCHIVED");

    const response = await agent.get("/api/v1/boards/me");

    expect(response.status).toBe(404);
    expect(response.body.status).toBe("error");
  });

  it("rejects requests without an authenticated session", async () => {
    const response = await request(app).get("/api/v1/boards/me");

    expect(response.status).toBe(401);
  });

  it("rejects users with unverified email addresses", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
      false,
    );

    const response = await agent.get("/api/v1/boards/me");

    expect(response.status).toBe(403);
  });
});

describe("Board routes - GET /api/v1/boards/:id", () => {
  it("retrieves an active board for its owner", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const response = await agent.get(`/api/v1/boards/${board.id}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data.board.id).toBe(board.id);
    expect(response.body.data.board.members).toHaveLength(2);
  });

  it("retrieves an active board for its partner", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");

    const { agent, user: partner } = await createAuthenticatedUser(
      "Mayra",
      "mayra@example.com",
    );

    const board = await createBoardWithMembers(owner.id, partner.id);

    const response = await agent.get(`/api/v1/boards/${board.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.board.id).toBe(board.id);
  });

  it("rejects users who are not members of the board", async () => {
    const { agent } = await createAuthenticatedUser(
      "Lucas",
      "lucas@example.com",
    );

    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    const response = await agent.get(`/api/v1/boards/${board.id}`);

    expect(response.status).toBe(403);
    expect(response.body.status).toBe("error");
  });

  it("returns 404 when the board does not exist", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent.get(
      `/api/v1/boards/${randomUUID()}`,
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the board is archived", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");

    const board = await createBoardWithMembers(
      owner.id,
      partner.id,
      "ARCHIVED",
    );

    const response = await agent.get(`/api/v1/boards/${board.id}`);

    expect(response.status).toBe(404);
  });

  it("rejects requests with an invalid board ID", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent.get("/api/v1/boards/invalid-id");

    expect(response.status).toBe(400);
  });

  it("rejects requests without an authenticated session", async () => {
    const response = await request(app).get(
      `/api/v1/boards/${randomUUID()}`,
    );

    expect(response.status).toBe(401);
  });
});

describe("Board routes - PATCH /api/v1/boards/:id/archive", () => {
  it("archives the board and its memberships as the owner", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    const response = await agent.patch(
      `/api/v1/boards/${board.id}/archive`,
    );

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");

    const archivedBoard = response.body.data.board;

    expect(archivedBoard.status).toBe("ARCHIVED");
    expect(archivedBoard.archivedAt).not.toBeNull();
    expect(archivedBoard.members).toHaveLength(2);

    for (const member of archivedBoard.members) {
      expect(member.status).toBe("ARCHIVED");
      expect(member.archivedAt).not.toBeNull();
    }
  });

  it("allows the partner to archive the board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");

    const { agent, user: partner } = await createAuthenticatedUser(
      "Mayra",
      "mayra@example.com",
    );

    const board = await createBoardWithMembers(owner.id, partner.id);

    const response = await agent.patch(
      `/api/v1/boards/${board.id}/archive`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.board.status).toBe("ARCHIVED");
  });

  it("rejects users who are not members of the board", async () => {
    const { agent } = await createAuthenticatedUser(
      "Lucas",
      "lucas@example.com",
    );

    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    const response = await agent.patch(
      `/api/v1/boards/${board.id}/archive`,
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when the board does not exist", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent.patch(
      `/api/v1/boards/${randomUUID()}/archive`,
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the board is already archived", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");

    const board = await createBoardWithMembers(
      owner.id,
      partner.id,
      "ARCHIVED",
    );

    const response = await agent.patch(
      `/api/v1/boards/${board.id}/archive`,
    );

    expect(response.status).toBe(404);
  });

  it("rejects requests without an authenticated session", async () => {
    const response = await request(app).patch(
      `/api/v1/boards/${randomUUID()}/archive`,
    );

    expect(response.status).toBe(401);
  });

  it("rejects users with unverified email addresses", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
      false,
    );

    const response = await agent.patch(
      `/api/v1/boards/${randomUUID()}/archive`,
    );

    expect(response.status).toBe(403);
  });
});