
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import { prisma } from "../config/prisma.js";
import { app } from "../app.js";

/**
 * Cleans database tables before each test.
 */
async function cleanDatabase() {
  await prisma.memoryNote.deleteMany();
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
async function createUser(
  name: string,
  email: string,
  verified = true,
) {
  return prisma.user.create({
    data: {
      name,
      email,
      passwordHash: "test-password-hash",
      emailVerifiedAt: verified ? new Date() : null,
    },
  });
}

/**
 * Creates an active board with an owner and a partner.
 */
async function createBoardWithMembers(
  ownerId: string,
  partnerId: string,
) {
  return prisma.board.create({
    data: {
      name: "Agustin&Mayra",
      status: "ACTIVE",
      members: {
        create: [
          {
            userId: ownerId,
            role: "OWNER",
            status: "ACTIVE",
          },
          {
            userId: partnerId,
            role: "PARTNER",
            status: "ACTIVE",
          },
        ],
      },
    },
  });
}

/**
 * Creates a memory pin directly in the database for testing.
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
      position,
      memoryDate: new Date("2026-01-15T00:00:00.000Z"),
    },
  });
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

describe("Memory note routes - POST /api/v1/memories/:memoryId/notes", () => {
  it("creates a note inside a memory pin", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/notes`)
      .send({
        text: "Our first trip together",
        position: 1,
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("success");
    expect(response.body.data.note.memoryId).toBe(memory.id);
    expect(response.body.data.note.text).toBe("Our first trip together");
    expect(response.body.data.note.position).toBe(1);
  });

  it("allows the partner to create notes", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");

    const { agent, user: partner } = await createAuthenticatedUser(
      "Mayra",
      "mayra@example.com",
    );

    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/notes`)
      .send({
        text: "A note from the partner",
        position: 1,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.note.memoryId).toBe(memory.id);
  });

  it("rejects requests without an authenticated session", async () => {
    const response = await request(app)
      .post(`/api/v1/memories/${randomUUID()}/notes`)
      .send({
        text: "Unauthenticated note",
        position: 1,
      });

    expect(response.status).toBe(401);
  });

  it("rejects users with unverified email addresses", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
      false,
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/notes`)
      .send({
        text: "Unverified note",
        position: 1,
      });

    expect(response.status).toBe(403);
  });

  it("rejects invalid note data", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent
      .post(`/api/v1/memories/${randomUUID()}/notes`)
      .send({
        text: "",
        position: 1,
      });

    expect(response.status).toBe(400);
  });

  it("rejects positions outside the allowed range", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/notes`)
      .send({
        text: "Invalid position",
        position: 3,
      });

    expect(response.status).toBe(400);
  });

  it("returns 403 when the user is not a board member", async () => {
    const { agent } = await createAuthenticatedUser(
      "Lucas",
      "lucas@example.com",
    );

    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/notes`)
      .send({
        text: "Unauthorized note",
        position: 1,
      });

    expect(response.status).toBe(403);
  });

  it("returns 404 when the memory does not exist", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent
      .post(`/api/v1/memories/${randomUUID()}/notes`)
      .send({
        text: "Missing memory",
        position: 1,
      });

    expect(response.status).toBe(404);
  });

  it("returns 409 when the selected position is occupied", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await prisma.memoryNote.create({
      data: {
        memoryId: memory.id,
        text: "Existing note",
        position: 1,
      },
    });

    const response = await agent
      .post(`/api/v1/memories/${memory.id}/notes`)
      .send({
        text: "Duplicate position",
        position: 1,
      });

    expect(response.status).toBe(409);
  });
});

describe("Memory note routes - GET /api/v1/memories/:memoryId/notes", () => {
  it("retrieves all notes belonging to a memory pin", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await prisma.memoryNote.createMany({
      data: [
        { memoryId: memory.id, text: "Second note", position: 2 },
        { memoryId: memory.id, text: "First note", position: 1 },
      ],
    });

    const response = await agent.get(
      `/api/v1/memories/${memory.id}/notes`,
    );

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data.notes).toHaveLength(2);
    expect(
      response.body.data.notes.map(
        (note: { position: number }) => note.position,
      ),
    ).toEqual([1, 2]);
  });

  it("returns an empty array when the memory has no notes", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    const response = await agent.get(
      `/api/v1/memories/${memory.id}/notes`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.notes).toEqual([]);
  });

  it("rejects requests without an authenticated session", async () => {
    const response = await request(app).get(
      `/api/v1/memories/${randomUUID()}/notes`,
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 when the memory does not exist", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent.get(
      `/api/v1/memories/${randomUUID()}/notes`,
    );

    expect(response.status).toBe(404);
  });
});

describe("Memory note routes - PATCH /api/v1/memories/notes/:id", () => {
  it("updates a note's text", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    const note = await prisma.memoryNote.create({
      data: {
        memoryId: memory.id,
        text: "Original text",
        position: 1,
      },
    });

    const response = await agent
      .patch(`/api/v1/memories/notes/${note.id}`)
      .send({ text: "Updated text" });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data.note.text).toBe("Updated text");
  });

  it("rejects updates without any fields", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent
      .patch(`/api/v1/memories/notes/${randomUUID()}`)
      .send({});

    expect(response.status).toBe(400);
  });

  it("returns 404 when the note does not exist", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent
      .patch(`/api/v1/memories/notes/${randomUUID()}`)
      .send({ text: "Updated text" });

    expect(response.status).toBe(404);
  });

  it("rejects requests without an authenticated session", async () => {
    const response = await request(app)
      .patch(`/api/v1/memories/notes/${randomUUID()}`)
      .send({ text: "Updated text" });

    expect(response.status).toBe(401);
  });
});

describe("Memory note routes - DELETE /api/v1/memories/notes/:id", () => {
  it("deletes a note", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    const note = await prisma.memoryNote.create({
      data: {
        memoryId: memory.id,
        text: "Note to delete",
        position: 1,
      },
    });

    const response = await agent.delete(
      `/api/v1/memories/notes/${note.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.note.id).toBe(note.id);

    const deletedNote = await prisma.memoryNote.findUnique({
      where: { id: note.id },
    });

    expect(deletedNote).toBeNull();
  });

  it("rejects requests without an authenticated session", async () => {
    const response = await request(app).delete(
      `/api/v1/memories/notes/${randomUUID()}`,
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 when the note does not exist", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent.delete(
      `/api/v1/memories/notes/${randomUUID()}`,
    );

    expect(response.status).toBe(404);
  });
});
