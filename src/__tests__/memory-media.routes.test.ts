
import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../config/prisma.js";
import { app } from "../app.js";

const authenticatedAgents = new Map<
  string,
  ReturnType<typeof request.agent>
>();

/**
 * Removes all records created by the route tests.
 */
async function cleanDatabase() {
  authenticatedAgents.clear();

  await prisma.memoryNote.deleteMany();
  await prisma.memoryMedia.deleteMany();
  await prisma.memory.deleteMany();
  await prisma.boardMember.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.board.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.userSession.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Registers a user and stores its authenticated session agent.
 */
async function createUser(
  name: string,
  email: string,
  verified = true,
) {
  const agent = request.agent(app);

  const response = await agent.post("/api/v1/auth/register").send({
    name,
    email,
    password: "StrongPassword123!",
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`USER_REGISTRATION_FAILED: ${response.status}`);
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: verified ? new Date() : null },
  });

  authenticatedAgents.set(email, agent);

  return user;
}

/**
 * Retrieves an existing authenticated agent and configures email verification.
 */
async function createAuthenticatedUser(
  _name: string,
  email: string,
  verified = true,
) {
  const agent = authenticatedAgents.get(email);

  if (!agent) {
    throw new Error(`AUTHENTICATED_AGENT_NOT_FOUND: ${email}`);
  }

  await prisma.user.update({
    where: { email },
    data: { emailVerifiedAt: verified ? new Date() : null },
  });

  return agent;
}

/**
 * Creates a board with its owner and partner as active members.
 */
async function createBoardWithMembers(
  ownerId: string,
  partnerId: string,
) {
  return prisma.board.create({
    data: {
      name: "Test Board",
      members: {
        create: [
          { userId: ownerId, role: "OWNER", status: "ACTIVE" },
          { userId: partnerId, role: "PARTNER", status: "ACTIVE" },
        ],
      },
    },
  });
}

/**
 * Creates a memory record for route testing.
 */
async function createMemoryRecord(
  boardId: string,
  authorId: string,
  position = 1,
) {
  return prisma.memory.create({
    data: {
      boardId,
      authorId,
      memoryDate: new Date("2026-01-15T00:00:00.000Z"),
      position,
    },
  });
}

/**
 * Creates a memory media record for route testing.
 */
async function createMemoryMediaRecord(
  memoryId: string,
  position = 1,
  mediaType: "PHOTO" | "GIF" = "PHOTO",
) {
  return prisma.memoryMedia.create({
    data: {
      memoryId,
      mediaType,
      storageKey: `test/${randomUUID()}.jpg`,
      position,
    },
  });
}

beforeEach(async () => {
  await cleanDatabase();
});

describe("Memory media routes - POST /api/v1/memories/:memoryId/media", () => {
  it("creates photo metadata", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/media`)
      .send({
        mediaType: "PHOTO",
        storageKey: "photos/photo-1.jpg",
        takenAt: "2026-01-15",
        description: "Our first photo",
        position: 1,
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("success");
    expect(response.body.data.media).toMatchObject({
      memoryId: memory.id,
      mediaType: "PHOTO",
      storageKey: "photos/photo-1.jpg",
      description: "Our first photo",
      position: 1,
    });
  });

  it("creates GIF metadata", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/media`)
      .send({
        mediaType: "GIF",
        storageKey: "gifs/moment.gif",
        position: 1,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.media.mediaType).toBe("GIF");
  });

  it("allows the partner to create media metadata", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const agent = await createAuthenticatedUser(
      "Partner",
      "partner@example.com",
    );

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/media`)
      .send({
        mediaType: "PHOTO",
        storageKey: "photos/partner-photo.jpg",
        position: 1,
      });

    expect(response.status).toBe(201);
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app)
      .post(`/api/v1/memories/${randomUUID()}/media`)
      .send({
        mediaType: "PHOTO",
        storageKey: "photos/photo.jpg",
        position: 1,
      });

    expect(response.status).toBe(401);
  });

  it("rejects users with unverified email addresses", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const agent = await createAuthenticatedUser(
      "Owner",
      "owner@example.com",
      false,
    );

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/media`)
      .send({
        mediaType: "PHOTO",
        storageKey: "photos/photo.jpg",
        position: 1,
      });

    expect(response.status).toBe(403);
  });

  it("rejects invalid request data", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/media`)
      .send({
        mediaType: "VIDEO",
        storageKey: "",
        position: 1,
      });

    expect(response.status).toBe(400);
  });

  it("rejects invalid media positions", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/media`)
      .send({
        mediaType: "PHOTO",
        storageKey: "photos/photo.jpg",
        position: 4,
      });

    expect(response.status).toBe(400);
  });

  it("rejects invalid dates", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/media`)
      .send({
        mediaType: "PHOTO",
        storageKey: "photos/photo.jpg",
        takenAt: "2026-02-30",
        position: 1,
      });

    expect(response.status).toBe(400);
  });

  it("rejects users who are not board members", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    await createUser("Outsider", "outsider@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const agent = await createAuthenticatedUser(
      "Outsider",
      "outsider@example.com",
    );

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/media`)
      .send({
        mediaType: "PHOTO",
        storageKey: "photos/photo.jpg",
        position: 1,
      });

    expect(response.status).toBe(403);
  });

  it("returns 404 when the memory does not exist", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    await createBoardWithMembers(owner.id, partner.id);
    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent
      .post(`/api/v1/memories/${randomUUID()}/media`)
      .send({
        mediaType: "PHOTO",
        storageKey: "photos/photo.jpg",
        position: 1,
      });

    expect(response.status).toBe(404);
  });

  it("rejects duplicate media positions", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    await createMemoryMediaRecord(memory.id, 1);

    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/media`)
      .send({
        mediaType: "PHOTO",
        storageKey: "photos/photo-2.jpg",
        position: 1,
      });

    expect(response.status).toBe(409);
  });

  it("rejects a GIF when the memory already contains a photo", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    await createMemoryMediaRecord(memory.id, 1);

    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/media`)
      .send({
        mediaType: "GIF",
        storageKey: "gifs/moment.gif",
        position: 2,
      });

    expect(response.status).toBe(400);
  });
});

describe("Memory media routes - GET /api/v1/memories/:memoryId/media", () => {
  it("retrieves media metadata ordered by position", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await createMemoryMediaRecord(memory.id, 2);
    await createMemoryMediaRecord(memory.id, 1);

    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent.get(`/api/v1/memories/${memory.id}/media`);

    expect(response.status).toBe(200);
    expect(response.body.data.media).toHaveLength(2);
    expect(response.body.data.media[0].position).toBe(1);
    expect(response.body.data.media[1].position).toBe(2);
  });

  it("returns an empty array when the memory has no media", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent.get(`/api/v1/memories/${memory.id}/media`);

    expect(response.status).toBe(200);
    expect(response.body.data.media).toEqual([]);
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).get(
      `/api/v1/memories/${randomUUID()}/media`,
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 when the memory does not exist", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    await createBoardWithMembers(owner.id, partner.id);
    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent.get(
      `/api/v1/memories/${randomUUID()}/media`,
    );

    expect(response.status).toBe(404);
  });

  it("rejects users who are not board members", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    await createUser("Outsider", "outsider@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const agent = await createAuthenticatedUser(
      "Outsider",
      "outsider@example.com",
    );

    const response = await agent.get(`/api/v1/memories/${memory.id}/media`);

    expect(response.status).toBe(403);
  });
});

describe("Memory media routes - PATCH /api/v1/memories/media/:id", () => {
  it("updates media metadata", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const media = await createMemoryMediaRecord(memory.id);
    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent
      .patch(`/api/v1/memories/media/${media.id}`)
      .send({
        description: "Updated description",
        takenAt: "2026-02-10",
        position: 2,
      });

    expect(response.status).toBe(200);
    expect(response.body.data.media).toMatchObject({
      id: media.id,
      description: "Updated description",
      position: 2,
    });
  });

  it("allows clearing nullable metadata", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    const media = await prisma.memoryMedia.create({
      data: {
        memoryId: memory.id,
        mediaType: "PHOTO",
        storageKey: "photos/photo.jpg",
        takenAt: new Date("2026-01-15T00:00:00.000Z"),
        description: "Original description",
        position: 1,
      },
    });

    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent
      .patch(`/api/v1/memories/media/${media.id}`)
      .send({
        takenAt: null,
        description: null,
      });

    expect(response.status).toBe(200);
    expect(response.body.data.media.takenAt).toBeNull();
    expect(response.body.data.media.description).toBeNull();
  });

  it("rejects empty update payloads", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const media = await createMemoryMediaRecord(memory.id);
    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent
      .patch(`/api/v1/memories/media/${media.id}`)
      .send({});

    expect(response.status).toBe(400);
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app)
      .patch(`/api/v1/memories/media/${randomUUID()}`)
      .send({ description: "Updated" });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the media does not exist", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    await createBoardWithMembers(owner.id, partner.id);
    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent
      .patch(`/api/v1/memories/media/${randomUUID()}`)
      .send({ description: "Updated" });

    expect(response.status).toBe(404);
  });

  it("rejects invalid update data", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const media = await createMemoryMediaRecord(memory.id);
    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent
      .patch(`/api/v1/memories/media/${media.id}`)
      .send({ position: 4 });

    expect(response.status).toBe(400);
  });
});

describe("Memory media routes - DELETE /api/v1/memories/media/:id", () => {
  it("deletes media metadata", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const media = await createMemoryMediaRecord(memory.id);
    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent.delete(`/api/v1/memories/media/${media.id}`);

    expect(response.status).toBe(200);

    const deletedMedia = await prisma.memoryMedia.findUnique({
      where: { id: media.id },
    });

    expect(deletedMedia).toBeNull();
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).delete(
      `/api/v1/memories/media/${randomUUID()}`,
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 when the media does not exist", async () => {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    await createBoardWithMembers(owner.id, partner.id);
    const agent = await createAuthenticatedUser("Owner", "owner@example.com");

    const response = await agent.delete(
      `/api/v1/memories/media/${randomUUID()}`,
    );

    expect(response.status).toBe(404);
  });
});
