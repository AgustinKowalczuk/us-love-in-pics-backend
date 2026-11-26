import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

import request from "supertest";

import { prisma } from "../config/prisma.js";
import { app } from "../app.js";

import {
  createMemory,
  getMemories,
  getMemoryById,
  updateMemory,
  deleteMemory,
} from "../modules/memories/memory.service.js";

const DEFAULT_MEMORY_DATE = "2026-01-15";

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
async function createUser(name: string, email: string, verified = true) {
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
async function createBoardWithMembers(ownerId: string, partnerId: string) {
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
  memoryDate = DEFAULT_MEMORY_DATE,
) {
  return prisma.memory.create({
    data: {
      boardId,
      authorId,
      position,
      memoryDate: new Date(`${memoryDate}T00:00:00.000Z`),
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

describe("Memory service - createMemory()", () => {
  it("creates a memory pin with its date and position", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemory(owner.id, {
      boardId: board.id,
      memoryDate: "2026-03-15",
      position: 1,
    });

    expect(memory.boardId).toBe(board.id);
    expect(memory.authorId).toBe(owner.id);
    expect(memory.position).toBe(1);
    expect(memory.memoryDate.toISOString()).toBe("2026-03-15T00:00:00.000Z");
    expect(memory.author.name).toBe("Agustin");
    expect(memory.media).toHaveLength(0);
    expect(memory.notes).toHaveLength(0);
  });

  it("allows the partner to create memory pins", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemory(partner.id, {
      boardId: board.id,
      memoryDate: DEFAULT_MEMORY_DATE,
      position: 1,
    });

    expect(memory.authorId).toBe(partner.id);
    expect(memory.author.name).toBe("Mayra");
  });

  it("allows creating pins in different positions", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const first = await createMemory(owner.id, {
      boardId: board.id,
      memoryDate: "2026-01-10",
      position: 1,
    });

    const second = await createMemory(owner.id, {
      boardId: board.id,
      memoryDate: "2026-01-20",
      position: 2,
    });

    expect(first.position).toBe(1);
    expect(second.position).toBe(2);
  });

  it("rejects duplicate positions within the same board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    await createMemoryRecord(board.id, owner.id, 1);

    await expect(
      createMemory(owner.id, {
        boardId: board.id,
        memoryDate: DEFAULT_MEMORY_DATE,
        position: 1,
      }),
    ).rejects.toThrow("MEMORY_POSITION_TAKEN");
  });

 it("allows the same position in different boards", async () => {
  const owner = await createUser("Owner One", "owner-one@test.com");
  const partner = await createUser("Partner One", "partner-one@test.com");
  const secondOwner = await createUser("Owner Two", "owner-two@test.com");
  const secondPartner = await createUser(
    "Partner Two",
    "partner-two@test.com",
  );

  const firstBoard = await createBoardWithMembers(
    owner.id,
    partner.id,
  );

  const secondBoard = await createBoardWithMembers(
    secondOwner.id,
    secondPartner.id,
  );

  const firstMemory = await createMemory(owner.id, {
    boardId: firstBoard.id,
    memoryDate: "2026-01-01",
    position: 1,
  });

  const secondMemory = await createMemory(secondOwner.id, {
    boardId: secondBoard.id,
    memoryDate: "2026-01-01",
    position: 1,
  });

  expect(firstMemory.position).toBe(1);
  expect(secondMemory.position).toBe(1);
  expect(firstMemory.boardId).not.toBe(secondMemory.boardId);
});

  it("allows creating a pin in the thirteenth position", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemory(owner.id, {
      boardId: board.id,
      memoryDate: DEFAULT_MEMORY_DATE,
      position: 13,
    });

    expect(memory.position).toBe(13);
  });

  it("rejects users who are not active members of the board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const outsider = await createUser("Lucas", "lucas@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    await expect(
      createMemory(outsider.id, {
        boardId: board.id,
        memoryDate: DEFAULT_MEMORY_DATE,
        position: 1,
      }),
    ).rejects.toThrow("NOT_BOARD_MEMBER");
  });

  it("throws an error when the board does not exist", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(
      createMemory(user.id, {
        boardId: randomUUID(),
        memoryDate: DEFAULT_MEMORY_DATE,
        position: 1,
      }),
    ).rejects.toThrow("BOARD_NOT_FOUND");
  });

  it("rejects creating pins in an archived board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    await prisma.board.update({
      where: { id: board.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
      },
    });

    await expect(
      createMemory(owner.id, {
        boardId: board.id,
        memoryDate: DEFAULT_MEMORY_DATE,
        position: 1,
      }),
    ).rejects.toThrow("BOARD_NOT_FOUND");
  });
});

describe("Memory service - getMemories()", () => {
  it("retrieves all memory pins belonging to a board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    await createMemoryRecord(board.id, owner.id, 1);
    await createMemoryRecord(board.id, partner.id, 2);

    const memories = await getMemories(owner.id, board.id);

    expect(memories).toHaveLength(2);
    expect(memories.every((memory) => memory.boardId === board.id)).toBe(true);
    expect(memories[0].author).toBeDefined();
    expect(memories[0].media).toBeDefined();
    expect(memories[0].notes).toBeDefined();
  });

  it("returns pins ordered chronologically by memoryDate", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    await createMemoryRecord(board.id, owner.id, 1, "2026-03-20");
    await createMemoryRecord(board.id, partner.id, 2, "2026-01-10");
    await createMemoryRecord(board.id, owner.id, 3, "2026-02-15");

    const memories = await getMemories(owner.id, board.id);

    expect(
      memories.map((memory) => memory.memoryDate.toISOString().slice(0, 10)),
    ).toEqual(["2026-01-10", "2026-02-15", "2026-03-20"]);
  });

  it("uses position to order pins with the same memoryDate", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    await createMemoryRecord(board.id, owner.id, 3, DEFAULT_MEMORY_DATE);
    await createMemoryRecord(board.id, partner.id, 1, DEFAULT_MEMORY_DATE);
    await createMemoryRecord(board.id, owner.id, 2, DEFAULT_MEMORY_DATE);

    const memories = await getMemories(owner.id, board.id);

    expect(memories.map((memory) => memory.position)).toEqual([1, 2, 3]);
  });

  it("retrieves pins for the partner", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    await createMemoryRecord(board.id, owner.id, 1);

    const memories = await getMemories(partner.id, board.id);

    expect(memories).toHaveLength(1);
    expect(memories[0].authorId).toBe(owner.id);
  });

  it("returns an empty array when the board has no pins", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memories = await getMemories(owner.id, board.id);

    expect(memories).toEqual([]);
  });

  it("rejects users who are not active members of the board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const outsider = await createUser("Lucas", "lucas@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    await expect(getMemories(outsider.id, board.id)).rejects.toThrow(
      "NOT_BOARD_MEMBER",
    );
  });

  it("throws an error when the board does not exist", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(getMemories(user.id, randomUUID())).rejects.toThrow(
      "BOARD_NOT_FOUND",
    );
  });

  it("rejects retrieving pins from an archived board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    await prisma.board.update({
      where: { id: board.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
      },
    });

    await expect(getMemories(owner.id, board.id)).rejects.toThrow(
      "BOARD_NOT_FOUND",
    );
  });
});

describe("Memory service - getMemoryById()", () => {
  it("retrieves a pin with its author, media and notes", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id);

    const result = await getMemoryById(owner.id, memory.id);

    expect(result.id).toBe(memory.id);
    expect(result.author.name).toBe("Agustin");
    expect(result.media).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it("allows the partner to retrieve a pin created by the owner", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id);

    const result = await getMemoryById(partner.id, memory.id);

    expect(result.id).toBe(memory.id);
  });

  it("rejects users who are not active members of the board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const outsider = await createUser("Lucas", "lucas@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await expect(getMemoryById(outsider.id, memory.id)).rejects.toThrow(
      "NOT_BOARD_MEMBER",
    );
  });

  it("throws an error when the pin does not exist", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(getMemoryById(user.id, randomUUID())).rejects.toThrow(
      "MEMORY_NOT_FOUND",
    );
  });
});

describe("Memory service - updateMemory()", () => {
  it("updates a pin's memoryDate", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id);

    const result = await updateMemory(owner.id, memory.id, {
      memoryDate: "2026-05-20",
    });

    expect(result.id).toBe(memory.id);
    expect(result.memoryDate.toISOString()).toBe("2026-05-20T00:00:00.000Z");
    expect(result.position).toBe(1);
  });

  it("updates a pin's position", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id);

    const result = await updateMemory(owner.id, memory.id, {
      position: 5,
    });

    expect(result.position).toBe(5);
  });

  it("updates both memoryDate and position", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id);

    const result = await updateMemory(owner.id, memory.id, {
      memoryDate: "2026-06-10",
      position: 7,
    });

    expect(result.memoryDate.toISOString()).toBe("2026-06-10T00:00:00.000Z");
    expect(result.position).toBe(7);
  });

  it("allows the partner to update a pin created by the owner", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id);

    const result = await updateMemory(partner.id, memory.id, {
      memoryDate: "2026-07-01",
    });

    expect(result.memoryDate.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(result.authorId).toBe(owner.id);
  });

  it("rejects updating a pin to an occupied position", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const first = await createMemoryRecord(board.id, owner.id, 1);
    const second = await createMemoryRecord(board.id, owner.id, 2);

    await expect(
      updateMemory(owner.id, second.id, { position: first.position }),
    ).rejects.toThrow("MEMORY_POSITION_TAKEN");
  });

  it("rejects users who are not active members of the board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const outsider = await createUser("Lucas", "lucas@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await expect(
      updateMemory(outsider.id, memory.id, {
        memoryDate: "2026-08-01",
      }),
    ).rejects.toThrow("NOT_BOARD_MEMBER");
  });

  it("throws an error when the pin does not exist", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(
      updateMemory(user.id, randomUUID(), {
        memoryDate: "2026-08-01",
      }),
    ).rejects.toThrow("MEMORY_NOT_FOUND");
  });
});

describe("Memory service - deleteMemory()", () => {
  it("deletes a pin created by the owner", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id);

    const result = await deleteMemory(owner.id, memory.id);

    expect(result.id).toBe(memory.id);

    const deletedMemory = await prisma.memory.findUnique({
      where: { id: memory.id },
    });

    expect(deletedMemory).toBeNull();
  });

  it("deletes associated media and notes metadata through cascade", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id);

    const media = await prisma.memoryMedia.create({
      data: {
        memoryId: memory.id,
        mediaType: "PHOTO",
        storageKey: "test/photo.jpg",
        takenAt: new Date("2026-01-10T00:00:00.000Z"),
        description: "A test photo",
        position: 1,
      },
    });

    const note = await prisma.memoryNote.create({
      data: {
        memoryId: memory.id,
        text: "A test note",
        position: 1,
      },
    });

    await deleteMemory(owner.id, memory.id);

    const deletedMedia = await prisma.memoryMedia.findUnique({
      where: { id: media.id },
    });

    const deletedNote = await prisma.memoryNote.findUnique({
      where: { id: note.id },
    });

    expect(deletedMedia).toBeNull();
    expect(deletedNote).toBeNull();
  });

  it("allows the partner to delete a pin created by the owner", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id);

    await deleteMemory(partner.id, memory.id);

    const deletedMemory = await prisma.memory.findUnique({
      where: { id: memory.id },
    });

    expect(deletedMemory).toBeNull();
  });

  it("rejects users who are not active members of the board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const outsider = await createUser("Lucas", "lucas@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await expect(deleteMemory(outsider.id, memory.id)).rejects.toThrow(
      "NOT_BOARD_MEMBER",
    );
  });

  it("throws an error when the pin does not exist", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(deleteMemory(user.id, randomUUID())).rejects.toThrow(
      "MEMORY_NOT_FOUND",
    );
  });
});

describe("Memory routes - POST /api/v1/memories", () => {
  it("creates a memory pin", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const response = await agent.post("/api/v1/memories").send({
      boardId: board.id,
      memoryDate: "2026-03-15",
      position: 1,
    });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("success");
    expect(response.body.data.memory.boardId).toBe(board.id);
    expect(response.body.data.memory.position).toBe(1);
    expect(response.body.data.memory.memoryDate).toContain("2026-03-15");
  });

  it("rejects requests without an authenticated session", async () => {
    const response = await request(app).post("/api/v1/memories").send({
      boardId: randomUUID(),
      memoryDate: DEFAULT_MEMORY_DATE,
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

    const response = await agent.post("/api/v1/memories").send({
      boardId: board.id,
      memoryDate: DEFAULT_MEMORY_DATE,
      position: 1,
    });

    expect(response.status).toBe(403);
  });

  it("rejects invalid memory data", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent.post("/api/v1/memories").send({
      boardId: "invalid-id",
      memoryDate: DEFAULT_MEMORY_DATE,
      position: 1,
    });

    expect(response.status).toBe(400);
  });

  it("rejects invalid calendar dates", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const response = await agent.post("/api/v1/memories").send({
      boardId: board.id,
      memoryDate: "2026-02-30",
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

    const response = await agent.post("/api/v1/memories").send({
      boardId: board.id,
      memoryDate: DEFAULT_MEMORY_DATE,
      position: 14,
    });

    expect(response.status).toBe(400);
  });

  it("rejects requests with missing fields", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent.post("/api/v1/memories").send({
      boardId: randomUUID(),
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

    const response = await agent.post("/api/v1/memories").send({
      boardId: board.id,
      memoryDate: DEFAULT_MEMORY_DATE,
      position: 1,
    });

    expect(response.status).toBe(403);
  });

  it("returns 409 when the selected position is occupied", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    await createMemoryRecord(board.id, owner.id, 1);

    const response = await agent.post("/api/v1/memories").send({
      boardId: board.id,
      memoryDate: DEFAULT_MEMORY_DATE,
      position: 1,
    });

    expect(response.status).toBe(409);
    expect(response.body.status).toBe("error");
  });
});

describe("Memory routes - GET /api/v1/memories/board/:boardId", () => {
  it("retrieves all memory pins for a board", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    await createMemoryRecord(board.id, owner.id, 1);
    await createMemoryRecord(board.id, partner.id, 2);

    const response = await agent.get(`/api/v1/memories/board/${board.id}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data.memories).toHaveLength(2);
  });

  it("rejects requests with an invalid board ID", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent.get("/api/v1/memories/board/invalid-id");

    expect(response.status).toBe(400);
  });

  it("rejects requests without an authenticated session", async () => {
    const response = await request(app).get(
      `/api/v1/memories/board/${randomUUID()}`,
    );

    expect(response.status).toBe(401);
  });
});

describe("Memory routes - GET /api/v1/memories/:id", () => {
  it("retrieves a specific memory pin", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id);

    const response = await agent.get(`/api/v1/memories/${memory.id}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data.memory.id).toBe(memory.id);
    expect(response.body.data.memory.position).toBe(1);
  });

  it("returns 404 when the memory does not exist", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent.get(`/api/v1/memories/${randomUUID()}`);

    expect(response.status).toBe(404);
  });

  it("rejects requests with an invalid memory ID", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent.get("/api/v1/memories/invalid-id");

    expect(response.status).toBe(400);
  });

  it("rejects requests without an authenticated session", async () => {
    const response = await request(app).get(`/api/v1/memories/${randomUUID()}`);

    expect(response.status).toBe(401);
  });
});

describe("Memory routes - PATCH /api/v1/memories/:id", () => {
  it("updates a pin's memoryDate", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id);

    const response = await agent.patch(`/api/v1/memories/${memory.id}`).send({
      memoryDate: "2026-04-20",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.memory.memoryDate).toContain("2026-04-20");
  });

  it("updates a pin's position", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id);

    const response = await agent.patch(`/api/v1/memories/${memory.id}`).send({
      position: 5,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.memory.position).toBe(5);
  });

  it("rejects updates without any fields", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent
      .patch(`/api/v1/memories/${randomUUID()}`)
      .send({});

    expect(response.status).toBe(400);
  });

  it("rejects updates with invalid dates", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent
      .patch(`/api/v1/memories/${randomUUID()}`)
      .send({
        memoryDate: "2026-02-30",
      });

    expect(response.status).toBe(400);
  });

  it("rejects updates with positions outside the allowed range", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent
      .patch(`/api/v1/memories/${randomUUID()}`)
      .send({
        position: 14,
      });

    expect(response.status).toBe(400);
  });

  it("rejects requests without an authenticated session", async () => {
    const response = await request(app)
      .patch(`/api/v1/memories/${randomUUID()}`)
      .send({
        memoryDate: "2026-04-20",
      });

    expect(response.status).toBe(401);
  });
});

describe("Memory routes - DELETE /api/v1/memories/:id", () => {
  it("deletes a memory pin", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id);

    const response = await agent.delete(`/api/v1/memories/${memory.id}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data.memory.id).toBe(memory.id);

    const deletedMemory = await prisma.memory.findUnique({
      where: { id: memory.id },
    });

    expect(deletedMemory).toBeNull();
  });

  it("allows the partner to delete a pin created by the owner", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");

    const { agent, user: partner } = await createAuthenticatedUser(
      "Mayra",
      "mayra@example.com",
    );

    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    const response = await agent.delete(`/api/v1/memories/${memory.id}`);

    expect(response.status).toBe(200);
  });

  it("returns 404 when the memory does not exist", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent.delete(`/api/v1/memories/${randomUUID()}`);

    expect(response.status).toBe(404);
  });

  it("rejects requests with an invalid memory ID", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent.delete("/api/v1/memories/invalid-id");

    expect(response.status).toBe(400);
  });

  it("rejects requests without an authenticated session", async () => {
    const response = await request(app).delete(
      `/api/v1/memories/${randomUUID()}`,
    );

    expect(response.status).toBe(401);
  });
});
