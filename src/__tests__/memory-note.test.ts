import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../config/prisma.js";
import {
  createMemoryNote,
  getMemoryNotes,
  updateMemoryNote,
  deleteMemoryNote,
} from "../modules/memories/memory-note.service.js";

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
 * Creates a registered user.
 */
async function createUser(name: string, email: string) {
  return prisma.user.create({
    data: {
      name,
      email,
      passwordHash: "test-password-hash",
      emailVerifiedAt: new Date(),
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
 * Creates a memory pin directly in the database.
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
      memoryDate: new Date(`${DEFAULT_MEMORY_DATE}T00:00:00.000Z`),
    },
  });
}

/**
 * Creates a note directly in the database.
 */
async function createMemoryNoteRecord(
  memoryId: string,
  text: string,
  position: number,
) {
  return prisma.memoryNote.create({
    data: {
      memoryId,
      text,
      position,
    },
  });
}

beforeEach(async () => {
  await cleanDatabase();
});

describe("MemoryNote service - createMemoryNote()", () => {
  it("creates a note belonging to a memory pin", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    const note = await createMemoryNote(owner.id, memory.id, {
      text: "Our first trip together",
      position: 1,
    });

    expect(note.memoryId).toBe(memory.id);
    expect(note.text).toBe("Our first trip together");
    expect(note.position).toBe(1);
  });

  it("allows the partner to create a note", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    const note = await createMemoryNote(partner.id, memory.id, {
      text: "A memory from Mayra",
      position: 1,
    });

    expect(note.memoryId).toBe(memory.id);
    expect(note.text).toBe("A memory from Mayra");
  });

  it("allows creating two notes in the same pin", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    const first = await createMemoryNote(owner.id, memory.id, {
      text: "First note",
      position: 1,
    });

    const second = await createMemoryNote(partner.id, memory.id, {
      text: "Second note",
      position: 2,
    });

    expect(first.position).toBe(1);
    expect(second.position).toBe(2);
  });

  it("rejects creating more than two notes in a pin", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await createMemoryNoteRecord(memory.id, "First note", 1);
    await createMemoryNoteRecord(memory.id, "Second note", 2);

    await expect(
      createMemoryNote(owner.id, memory.id, {
        text: "Third note",
        position: 1,
      }),
    ).rejects.toThrow("MEMORY_COMPOSITION_INVALID");
  });

  it.each([0, 3, -1, 1.5])(
    "rejects an invalid note position when creating a note (%s)",
    async (position) => {
      const owner = await createUser("Agustin", "agustin@example.com");
      const partner = await createUser("Mayra", "mayra@example.com");
      const board = await createBoardWithMembers(owner.id, partner.id);
      const memory = await createMemoryRecord(board.id, owner.id);

      await expect(
        createMemoryNote(owner.id, memory.id, {
          text: "Invalid position",
          position,
        }),
      ).rejects.toThrow("INVALID_MEMORY_NOTE_POSITION");
    },
  );

  it("rejects a duplicate note position in the same pin", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await createMemoryNoteRecord(memory.id, "First note", 1);

    await expect(
      createMemoryNote(partner.id, memory.id, {
        text: "Duplicate position",
        position: 1,
      }),
    ).rejects.toThrow("MEMORY_NOTE_POSITION_TAKEN");
  });

  it("rejects creating a note when the pin already contains three photos", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await prisma.memoryMedia.createMany({
      data: [1, 2, 3].map((position) => ({
        memoryId: memory.id,
        mediaType: "PHOTO",
        storageKey: `photos/${position}.jpg`,
        position,
      })),
    });

    await expect(
      createMemoryNote(owner.id, memory.id, {
        text: "An additional note",
        position: 1,
      }),
    ).rejects.toThrow("MEMORY_COMPOSITION_INVALID");
  });

  it("rejects creating a note when the pin already contains a GIF", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await prisma.memoryMedia.create({
      data: {
        memoryId: memory.id,
        mediaType: "GIF",
        storageKey: "gifs/memory.gif",
        position: 1,
      },
    });

    await expect(
      createMemoryNote(owner.id, memory.id, {
        text: "A note alongside a GIF",
        position: 1,
      }),
    ).rejects.toThrow("MEMORY_COMPOSITION_INVALID");
  });

  it("allows the same note position in different pins", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);

    const firstMemory = await createMemoryRecord(board.id, owner.id, 1);
    const secondMemory = await createMemoryRecord(board.id, owner.id, 2);

    const firstNote = await createMemoryNote(owner.id, firstMemory.id, {
      text: "First pin note",
      position: 1,
    });

    const secondNote = await createMemoryNote(owner.id, secondMemory.id, {
      text: "Second pin note",
      position: 1,
    });

    expect(firstNote.position).toBe(1);
    expect(secondNote.position).toBe(1);
    expect(firstNote.memoryId).not.toBe(secondNote.memoryId);
  });

  it("rejects users who are not active board members", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const outsider = await createUser("Lucas", "lucas@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await expect(
      createMemoryNote(outsider.id, memory.id, {
        text: "Unauthorized note",
        position: 1,
      }),
    ).rejects.toThrow("NOT_BOARD_MEMBER");
  });

  it("rejects creating notes in an archived board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await prisma.board.update({
      where: { id: board.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
      },
    });

    await expect(
      createMemoryNote(owner.id, memory.id, {
        text: "Archived board note",
        position: 1,
      }),
    ).rejects.toThrow("BOARD_NOT_FOUND");
  });

  it("throws an error when the memory pin does not exist", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(
      createMemoryNote(user.id, randomUUID(), {
        text: "Missing memory note",
        position: 1,
      }),
    ).rejects.toThrow("MEMORY_NOT_FOUND");
  });
});

describe("MemoryNote service - getMemoryNotes()", () => {
  it("retrieves all notes belonging to a memory pin", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await createMemoryNoteRecord(memory.id, "First note", 1);
    await createMemoryNoteRecord(memory.id, "Second note", 2);

    const notes = await getMemoryNotes(owner.id, memory.id);

    expect(notes).toHaveLength(2);
    expect(notes.every((note) => note.memoryId === memory.id)).toBe(true);
  });

  it("returns notes ordered by position", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await createMemoryNoteRecord(memory.id, "Second note", 2);
    await createMemoryNoteRecord(memory.id, "First note", 1);

    const notes = await getMemoryNotes(owner.id, memory.id);

    expect(notes.map((note) => note.position)).toEqual([1, 2]);
    expect(notes.map((note) => note.text)).toEqual([
      "First note",
      "Second note",
    ]);
  });

  it("allows the partner to retrieve notes", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await createMemoryNoteRecord(memory.id, "Shared note", 1);

    const notes = await getMemoryNotes(partner.id, memory.id);

    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe("Shared note");
  });

  it("returns an empty array when the pin has no notes", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    const notes = await getMemoryNotes(owner.id, memory.id);

    expect(notes).toEqual([]);
  });

  it("rejects users who are not active board members", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const outsider = await createUser("Lucas", "lucas@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await expect(getMemoryNotes(outsider.id, memory.id)).rejects.toThrow(
      "NOT_BOARD_MEMBER",
    );
  });

  it("rejects retrieving notes from an archived board", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    await prisma.board.update({
      where: { id: board.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
      },
    });

    await expect(getMemoryNotes(owner.id, memory.id)).rejects.toThrow(
      "BOARD_NOT_FOUND",
    );
  });

  it("throws an error when the memory pin does not exist", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(getMemoryNotes(user.id, randomUUID())).rejects.toThrow(
      "MEMORY_NOT_FOUND",
    );
  });
});

describe("MemoryNote service - updateMemoryNote()", () => {
  it("updates a note's text", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const note = await createMemoryNoteRecord(memory.id, "Original text", 1);

    const result = await updateMemoryNote(owner.id, note.id, {
      text: "Updated text",
    });

    expect(result.id).toBe(note.id);
    expect(result.text).toBe("Updated text");
    expect(result.position).toBe(1);
  });

  it("updates a note's position", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const note = await createMemoryNoteRecord(memory.id, "Test note", 1);

    const result = await updateMemoryNote(owner.id, note.id, {
      position: 2,
    });

    expect(result.position).toBe(2);
  });

  it.each([0, 3, -1, 1.5])(
    "rejects an invalid note position when updating a note (%s)",
    async (position) => {
      const owner = await createUser("Agustin", "agustin@example.com");
      const partner = await createUser("Mayra", "mayra@example.com");
      const board = await createBoardWithMembers(owner.id, partner.id);
      const memory = await createMemoryRecord(board.id, owner.id);
      const note = await createMemoryNoteRecord(memory.id, "Test note", 1);

      await expect(
        updateMemoryNote(owner.id, note.id, { position }),
      ).rejects.toThrow("INVALID_MEMORY_NOTE_POSITION");
    },
  );

  it("rejects updating a note to an occupied position", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);

    const firstNote = await createMemoryNoteRecord(memory.id, "First note", 1);

    await createMemoryNoteRecord(memory.id, "Second note", 2);

    await expect(
      updateMemoryNote(partner.id, firstNote.id, {
        position: 2,
      }),
    ).rejects.toThrow("MEMORY_NOTE_POSITION_TAKEN");
  });

  it("allows the partner to update a note created by the owner", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const note = await createMemoryNoteRecord(memory.id, "Original text", 1);

    const result = await updateMemoryNote(partner.id, note.id, {
      text: "Updated by partner",
    });

    expect(result.text).toBe("Updated by partner");
  });

  it("rejects users who are not active board members", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const outsider = await createUser("Lucas", "lucas@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const note = await createMemoryNoteRecord(memory.id, "Test note", 1);

    await expect(
      updateMemoryNote(outsider.id, note.id, {
        text: "Unauthorized update",
      }),
    ).rejects.toThrow("NOT_BOARD_MEMBER");
  });

  it("throws an error when the note does not exist", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(
      updateMemoryNote(user.id, randomUUID(), {
        text: "Updated text",
      }),
    ).rejects.toThrow("MEMORY_NOTE_NOT_FOUND");
  });
});

describe("MemoryNote service - deleteMemoryNote()", () => {
  it("deletes a note", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const note = await createMemoryNoteRecord(memory.id, "Test note", 1);

    const result = await deleteMemoryNote(owner.id, note.id);

    expect(result.id).toBe(note.id);

    const deletedNote = await prisma.memoryNote.findUnique({
      where: { id: note.id },
    });

    expect(deletedNote).toBeNull();
  });

  it("allows the partner to delete a note created by the owner", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const note = await createMemoryNoteRecord(memory.id, "Test note", 1);

    const result = await deleteMemoryNote(partner.id, note.id);

    expect(result.id).toBe(note.id);
  });

  it("rejects users who are not active board members", async () => {
    const owner = await createUser("Agustin", "agustin@example.com");
    const partner = await createUser("Mayra", "mayra@example.com");
    const outsider = await createUser("Lucas", "lucas@example.com");
    const board = await createBoardWithMembers(owner.id, partner.id);
    const memory = await createMemoryRecord(board.id, owner.id);
    const note = await createMemoryNoteRecord(memory.id, "Test note", 1);

    await expect(deleteMemoryNote(outsider.id, note.id)).rejects.toThrow(
      "NOT_BOARD_MEMBER",
    );
  });

  it("throws an error when the note does not exist", async () => {
    const user = await createUser("Agustin", "agustin@example.com");

    await expect(deleteMemoryNote(user.id, randomUUID())).rejects.toThrow(
      "MEMORY_NOTE_NOT_FOUND",
    );
  });
});
