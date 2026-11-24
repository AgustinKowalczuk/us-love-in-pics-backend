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
 * Creates a memory directly in the database for testing.
 */
async function createMemoryRecord(
  boardId: string,
  authorId: string,
  type: "NOTE" | "PHOTO" | "GIF" = "NOTE",
  text: string | null = "Test memory",
) {
  return prisma.memory.create({
    data: {
      boardId,
      authorId,
      type,
      text: type === "NOTE" ? text : null,
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
  it("creates a note memory", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemory(owner.id, {
      boardId: board.id,
      type: "NOTE",
      text: "Our first memory",
    });

    expect(memory.boardId).toBe(board.id);
    expect(memory.authorId).toBe(owner.id);
    expect(memory.type).toBe("NOTE");
    expect(memory.text).toBe("Our first memory");
    expect(memory.author.name).toBe("Agustin");
    expect(memory.media).toHaveLength(0);
  });

  it("creates a photo memory", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemory(owner.id, {
      boardId: board.id,
      type: "PHOTO",
    });

    expect(memory.type).toBe("PHOTO");
    expect(memory.text).toBeNull();
    expect(memory.authorId).toBe(owner.id);
  });

  it("creates a GIF memory", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemory(owner.id, {
      boardId: board.id,
      type: "GIF",
    });

    expect(memory.type).toBe("GIF");
    expect(memory.text).toBeNull();
    expect(memory.authorId).toBe(owner.id);
  });

  it("allows the partner to create memories", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemory(partner.id, {
      boardId: board.id,
      type: "NOTE",
      text: "A memory from Mayra",
    });

    expect(memory.authorId).toBe(partner.id);
    expect(memory.author.name).toBe("Mayra");
  });

  it("rejects users who are not active members of the board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const outsider = await createUser("Lucas", "lucas@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    await expect(
      createMemory(outsider.id, {
        boardId: board.id,
        type: "NOTE",
        text: "Unauthorized memory",
      }),
    ).rejects.toThrow("NOT_BOARD_MEMBER");
  });

  it("throws an error when the board does not exist", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(
      createMemory(user.id, {
        boardId: randomUUID(),
        type: "NOTE",
        text: "Test memory",
      }),
    ).rejects.toThrow("BOARD_NOT_FOUND");
  });

  it("rejects creating memories in an archived board", async () => {
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
        type: "NOTE",
        text: "Test memory",
      }),
    ).rejects.toThrow("BOARD_NOT_FOUND");
  });

  it("rejects notes when the note limit is reached", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    for (let i = 0; i < 6; i++) {
      await createMemoryRecord(board.id, owner.id, "NOTE", `Note ${i + 1}`);
    }

    await expect(
      createMemory(owner.id, {
        boardId: board.id,
        type: "NOTE",
        text: "Seventh note",
      }),
    ).rejects.toThrow("NOTE_LIMIT_REACHED");
  });

  it("rejects photos when the photo limit is reached", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    for (let i = 0; i < 6; i++) {
      await createMemoryRecord(board.id, owner.id, "PHOTO");
    }

    await expect(
      createMemory(owner.id, {
        boardId: board.id,
        type: "PHOTO",
      }),
    ).rejects.toThrow("PHOTO_LIMIT_REACHED");
  });

  it("rejects GIFs when the GIF limit is reached", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    await createMemoryRecord(board.id, owner.id, "GIF");

    await expect(
      createMemory(owner.id, {
        boardId: board.id,
        type: "GIF",
      }),
    ).rejects.toThrow("GIF_LIMIT_REACHED");
  });

  it("enforces limits independently for each memory type", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    for (let i = 0; i < 6; i++) {
      await createMemoryRecord(board.id, owner.id, "NOTE", `Note ${i + 1}`);
      await createMemoryRecord(board.id, owner.id, "PHOTO");
    }

    await createMemoryRecord(board.id, owner.id, "GIF");

    const note = await createMemory(owner.id, {
      boardId: board.id,
      type: "GIF",
    }).catch(() => null);

    expect(note).toBeNull();

    await expect(
      createMemory(owner.id, {
        boardId: board.id,
        type: "NOTE",
        text: "Another note",
      }),
    ).rejects.toThrow("NOTE_LIMIT_REACHED");

    await expect(
      createMemory(owner.id, {
        boardId: board.id,
        type: "PHOTO",
      }),
    ).rejects.toThrow("PHOTO_LIMIT_REACHED");
  });
});

describe("Memory service - getMemories()", () => {
  it("retrieves all memories belonging to a board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    await createMemoryRecord(board.id, owner.id, "NOTE", "First note");
    await createMemoryRecord(board.id, partner.id, "NOTE", "Second note");
    await createMemoryRecord(board.id, owner.id, "PHOTO");

    const memories = await getMemories(owner.id, board.id);

    expect(memories).toHaveLength(3);
    expect(memories.every((memory) => memory.boardId === board.id)).toBe(true);
    expect(memories[0].author).toBeDefined();
    expect(memories[0].media).toBeDefined();
  });

  it("retrieves memories for the partner", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    await createMemoryRecord(board.id, owner.id, "NOTE", "Shared memory");

    const memories = await getMemories(partner.id, board.id);

    expect(memories).toHaveLength(1);
    expect(memories[0].text).toBe("Shared memory");
  });

  it("returns an empty array when the board has no memories", async () => {
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

  it("rejects retrieving memories from an archived board", async () => {
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
  it("retrieves a memory with its author and media", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(
      board.id,
      owner.id,
      "NOTE",
      "Our memory",
    );

    const result = await getMemoryById(owner.id, memory.id);

    expect(result.id).toBe(memory.id);
    expect(result.text).toBe("Our memory");
    expect(result.author.name).toBe("Agustin");
    expect(result.media).toEqual([]);
  });

  it("allows the partner to retrieve the memory", async () => {
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

  it("throws an error when the memory does not exist", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(getMemoryById(user.id, randomUUID())).rejects.toThrow(
      "MEMORY_NOT_FOUND",
    );
  });
});

describe("Memory service - updateMemory()", () => {
  it("updates the text of a note", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(
      board.id,
      owner.id,
      "NOTE",
      "Original text",
    );

    const result = await updateMemory(owner.id, memory.id, "Updated text");

    expect(result.id).toBe(memory.id);
    expect(result.text).toBe("Updated text");
  });

  it("allows the partner to update a note created by the owner", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(
      board.id,
      owner.id,
      "NOTE",
      "Original text",
    );

    const result = await updateMemory(
      partner.id,
      memory.id,
      "Updated by partner",
    );

    expect(result.text).toBe("Updated by partner");
    expect(result.authorId).toBe(owner.id);
  });

  it("rejects updating photo memories", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id, "PHOTO");

    await expect(
      updateMemory(owner.id, memory.id, "Updated text"),
    ).rejects.toThrow("MEMORY_NOT_EDITABLE");
  });

  it("rejects updating GIF memories", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id, "GIF");

    await expect(
      updateMemory(owner.id, memory.id, "Updated text"),
    ).rejects.toThrow("MEMORY_NOT_EDITABLE");
  });

  it("rejects users who are not active members of the board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const outsider = await createUser("Lucas", "lucas@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await expect(
      updateMemory(outsider.id, memory.id, "Unauthorized update"),
    ).rejects.toThrow("NOT_BOARD_MEMBER");
  });

  it("throws an error when the memory does not exist", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(
      updateMemory(user.id, randomUUID(), "Updated text"),
    ).rejects.toThrow("MEMORY_NOT_FOUND");
  });
});

describe("Memory service - deleteMemory()", () => {
  it("deletes a memory created by the owner", async () => {
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

  it("allows the partner to delete a memory created by the owner", async () => {
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

  it("throws an error when the memory does not exist", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(deleteMemory(user.id, randomUUID())).rejects.toThrow(
      "MEMORY_NOT_FOUND",
    );
  });
});

describe("Memory routes - POST /api/v1/memories", () => {
  it("creates a note memory", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const response = await agent.post("/api/v1/memories").send({
      boardId: board.id,
      type: "NOTE",
      text: "Our first memory",
    });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("success");
    expect(response.body.data.memory.type).toBe("NOTE");
    expect(response.body.data.memory.text).toBe("Our first memory");
  });

  it("creates a photo memory", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const response = await agent.post("/api/v1/memories").send({
      boardId: board.id,
      type: "PHOTO",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.memory.type).toBe("PHOTO");
    expect(response.body.data.memory.text).toBeNull();
  });

  it("creates a GIF memory", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const response = await agent.post("/api/v1/memories").send({
      boardId: board.id,
      type: "GIF",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.memory.type).toBe("GIF");
  });

  it("rejects requests without an authenticated session", async () => {
    const response = await request(app).post("/api/v1/memories").send({
      boardId: randomUUID(),
      type: "NOTE",
      text: "Unauthorized",
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
      type: "NOTE",
      text: "Unverified user",
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
      type: "NOTE",
      text: "Invalid memory",
    });

    expect(response.status).toBe(400);
  });

  it("rejects notes without text", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const response = await agent.post("/api/v1/memories").send({
      boardId: board.id,
      type: "NOTE",
    });

    expect(response.status).toBe(400);
  });

  it("rejects media memories containing text", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const response = await agent.post("/api/v1/memories").send({
      boardId: board.id,
      type: "PHOTO",
      text: "This should not be allowed",
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
      type: "NOTE",
      text: "Unauthorized memory",
    });

    expect(response.status).toBe(403);
  });

  it("returns 409 when the note limit is reached", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    for (let i = 0; i < 6; i++) {
      await createMemoryRecord(board.id, owner.id, "NOTE", `Note ${i + 1}`);
    }

    const response = await agent.post("/api/v1/memories").send({
      boardId: board.id,
      type: "NOTE",
      text: "Seventh note",
    });

    expect(response.status).toBe(409);
    expect(response.body.status).toBe("error");
  });
});

describe("Memory routes - GET /api/v1/memories/board/:boardId", () => {
  it("retrieves all memories for a board", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    await createMemoryRecord(board.id, owner.id, "NOTE", "First note");
    await createMemoryRecord(board.id, partner.id, "PHOTO");

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
  it("retrieves a specific memory", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(
      board.id,
      owner.id,
      "NOTE",
      "Our memory",
    );

    const response = await agent.get(`/api/v1/memories/${memory.id}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data.memory.id).toBe(memory.id);
    expect(response.body.data.memory.text).toBe("Our memory");
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
  it("updates a note memory", async () => {
    const { agent, user: owner } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(
      board.id,
      owner.id,
      "NOTE",
      "Original text",
    );

    const response = await agent.patch(`/api/v1/memories/${memory.id}`).send({
      text: "Updated text",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.memory.text).toBe("Updated text");
  });

  it("rejects updating a memory with invalid text", async () => {
    const { agent } = await createAuthenticatedUser(
      "Agustin",
      "agustin@example.com",
    );

    const response = await agent
      .patch(`/api/v1/memories/${randomUUID()}`)
      .send({
        text: "",
      });

    expect(response.status).toBe(400);
  });

  it("rejects requests without an authenticated session", async () => {
    const response = await request(app)
      .patch(`/api/v1/memories/${randomUUID()}`)
      .send({
        text: "Updated text",
      });

    expect(response.status).toBe(401);
  });
});

describe("Memory routes - DELETE /api/v1/memories/:id", () => {
  it("deletes a memory", async () => {
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

  it("allows the partner to delete a memory created by the owner", async () => {
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
