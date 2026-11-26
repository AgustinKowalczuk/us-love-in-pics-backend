import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../config/prisma.js";
import {
  createMemoryMedia,
  getMemoryMedia,
  updateMemoryMedia,
  deleteMemoryMedia,
} from "../modules/memories/memory-media.service.js";

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
 * Creates an active board with two members.
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
 * Creates a photo record directly in the database.
 */
async function createPhotoRecord(
  memoryId: string,
  position: number,
  storageKey = `photos/${position}.jpg`,
) {
  return prisma.memoryMedia.create({
    data: {
      memoryId,
      mediaType: "PHOTO",
      storageKey,
      position,
    },
  });
}

/**
 * Creates a note record directly in the database.
 */
async function createNoteRecord(memoryId: string, position: number) {
  return prisma.memoryNote.create({
    data: {
      memoryId,
      text: `Note ${position}`,
      position,
    },
  });
}

describe("Memory media service", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  async function setup() {
    const owner = await createUser("Owner", "owner@example.com");
    const partner = await createUser("Partner", "partner@example.com");
    const outsider = await createUser("Outsider", "outsider@example.com");

    const board = await createBoardWithMembers(owner.id, partner.id);

    const memory = await createMemoryRecord(board.id, owner.id);

    return { owner, partner, outsider, board, memory };
  }

  describe("createMemoryMedia()", () => {
    it("creates a photo with its metadata", async () => {
      const { owner, memory } = await setup();

      const media = await createMemoryMedia(owner.id, memory.id, {
        mediaType: "PHOTO",
        storageKey: "photos/first.jpg",
        takenAt: "2025-12-20",
        description: "Our first trip",
        position: 1,
      });

      expect(media).toMatchObject({
        memoryId: memory.id,
        mediaType: "PHOTO",
        storageKey: "photos/first.jpg",
        description: "Our first trip",
        position: 1,
      });

      expect(media.takenAt?.toISOString()).toBe("2025-12-20T00:00:00.000Z");
    });

    it("trims the storage key and description", async () => {
      const { owner, memory } = await setup();

      const media = await createMemoryMedia(owner.id, memory.id, {
        mediaType: "PHOTO",
        storageKey: "  photos/first.jpg  ",
        description: "  Our memory  ",
        position: 1,
      });

      expect(media.storageKey).toBe("  photos/first.jpg  ");
      expect(media.description).toBe("Our memory");
    });

    it("creates a GIF without additional metadata", async () => {
      const { owner, memory } = await setup();

      const media = await createMemoryMedia(owner.id, memory.id, {
        mediaType: "GIF",
        storageKey: "gifs/moment.gif",
        position: 1,
      });

      expect(media).toMatchObject({
        memoryId: memory.id,
        mediaType: "GIF",
        storageKey: "gifs/moment.gif",
        takenAt: null,
        description: null,
        position: 1,
      });
    });

    it("allows the partner to create media", async () => {
      const { partner, memory } = await setup();

      const media = await createMemoryMedia(partner.id, memory.id, {
        mediaType: "PHOTO",
        storageKey: "photos/partner.jpg",
        position: 1,
      });

      expect(media.memoryId).toBe(memory.id);
    });

    it("allows up to three photos in one pin", async () => {
      const { owner, memory } = await setup();

      for (let position = 1; position <= 3; position++) {
        await createMemoryMedia(owner.id, memory.id, {
          mediaType: "PHOTO",
          storageKey: `photos/${position}.jpg`,
          position,
        });
      }

      const media = await prisma.memoryMedia.findMany({
        where: { memoryId: memory.id },
      });

      expect(media).toHaveLength(3);
    });

    it("rejects a fourth photo", async () => {
      const { owner, memory } = await setup();

      for (let position = 1; position <= 3; position++) {
        await createPhotoRecord(memory.id, position);
      }

      await expect(
        createMemoryMedia(owner.id, memory.id, {
          mediaType: "PHOTO",
          storageKey: "photos/fourth.jpg",
          position: 3,
        }),
      ).rejects.toThrow("MEMORY_COMPOSITION_INVALID");
    });

    it("rejects a GIF when the pin already contains a photo", async () => {
      const { owner, memory } = await setup();

      await createPhotoRecord(memory.id, 1);

      await expect(
        createMemoryMedia(owner.id, memory.id, {
          mediaType: "GIF",
          storageKey: "gifs/moment.gif",
          position: 2,
        }),
      ).rejects.toThrow("MEMORY_COMPOSITION_INVALID");
    });

    it("rejects a photo when the pin already contains a GIF", async () => {
      const { owner, memory } = await setup();

      await createMemoryMedia(owner.id, memory.id, {
        mediaType: "GIF",
        storageKey: "gifs/moment.gif",
        position: 1,
      });

      await expect(
        createMemoryMedia(owner.id, memory.id, {
          mediaType: "PHOTO",
          storageKey: "photos/first.jpg",
          position: 2,
        }),
      ).rejects.toThrow("MEMORY_COMPOSITION_INVALID");
    });

    it("rejects a GIF when the pin already contains notes", async () => {
      const { owner, memory } = await setup();

      await createNoteRecord(memory.id, 1);

      await expect(
        createMemoryMedia(owner.id, memory.id, {
          mediaType: "GIF",
          storageKey: "gifs/moment.gif",
          position: 1,
        }),
      ).rejects.toThrow("MEMORY_COMPOSITION_INVALID");
    });

    it("rejects a third photo when the pin already contains a note and two photos", async () => {
      const { owner, memory } = await setup();

      await createPhotoRecord(memory.id, 1);
      await createPhotoRecord(memory.id, 2);
      await createNoteRecord(memory.id, 1);

      await expect(
        createMemoryMedia(owner.id, memory.id, {
          mediaType: "PHOTO",
          storageKey: "photos/third.jpg",
          position: 3,
        }),
      ).rejects.toThrow("MEMORY_COMPOSITION_INVALID");
    });

    it("rejects a photo when the pin already contains two notes", async () => {
      const { owner, memory } = await setup();

      await createNoteRecord(memory.id, 1);
      await createNoteRecord(memory.id, 2);

      await expect(
        createMemoryMedia(owner.id, memory.id, {
          mediaType: "PHOTO",
          storageKey: "photos/first.jpg",
          position: 1,
        }),
      ).rejects.toThrow("MEMORY_COMPOSITION_INVALID");
    });

    it("rejects duplicate media positions", async () => {
      const { owner, memory } = await setup();

      await createPhotoRecord(memory.id, 1);

      await expect(
        createMemoryMedia(owner.id, memory.id, {
          mediaType: "PHOTO",
          storageKey: "photos/second.jpg",
          position: 1,
        }),
      ).rejects.toThrow("MEMORY_MEDIA_POSITION_TAKEN");
    });

    it("rejects invalid media positions", async () => {
      const { owner, memory } = await setup();

      for (const position of [0, 4, -1, 1.5]) {
        await expect(
          createMemoryMedia(owner.id, memory.id, {
            mediaType: "PHOTO",
            storageKey: `photos/${position}.jpg`,
            position,
          }),
        ).rejects.toThrow("INVALID_MEMORY_MEDIA_POSITION");
      }
    });

    it("rejects an empty storage key", async () => {
      const { owner, memory } = await setup();

      await expect(
        createMemoryMedia(owner.id, memory.id, {
          mediaType: "PHOTO",
          storageKey: "   ",
          position: 1,
        }),
      ).rejects.toThrow("INVALID_MEMORY_MEDIA_STORAGE_KEY");
    });

    it("rejects an invalid takenAt date", async () => {
      const { owner, memory } = await setup();

      await expect(
        createMemoryMedia(owner.id, memory.id, {
          mediaType: "PHOTO",
          storageKey: "photos/first.jpg",
          takenAt: "2025-02-30",
          position: 1,
        }),
      ).rejects.toThrow("INVALID_MEMORY_MEDIA_DATE");
    });

    it("rejects a date with an invalid format", async () => {
      const { owner, memory } = await setup();

      await expect(
        createMemoryMedia(owner.id, memory.id, {
          mediaType: "PHOTO",
          storageKey: "photos/first.jpg",
          takenAt: "20-12-2025",
          position: 1,
        }),
      ).rejects.toThrow("INVALID_MEMORY_MEDIA_DATE");
    });

    it("rejects an outsider", async () => {
      const { outsider, memory } = await setup();

      await expect(
        createMemoryMedia(outsider.id, memory.id, {
          mediaType: "PHOTO",
          storageKey: "photos/first.jpg",
          position: 1,
        }),
      ).rejects.toThrow("NOT_BOARD_MEMBER");
    });

    it("rejects media creation for a missing pin", async () => {
      const { owner } = await setup();

      await expect(
        createMemoryMedia(owner.id, "00000000-0000-4000-8000-000000000000", {
          mediaType: "PHOTO",
          storageKey: "photos/first.jpg",
          position: 1,
        }),
      ).rejects.toThrow("MEMORY_NOT_FOUND");
    });

    it("rejects media creation on an archived board", async () => {
      const { owner, board, memory } = await setup();

      await prisma.board.update({
        where: { id: board.id },
        data: { status: "ARCHIVED" },
      });

      await expect(
        createMemoryMedia(owner.id, memory.id, {
          mediaType: "PHOTO",
          storageKey: "photos/first.jpg",
          position: 1,
        }),
      ).rejects.toThrow("BOARD_NOT_FOUND");
    });
  });

  describe("getMemoryMedia()", () => {
    it("returns media ordered by position", async () => {
      const { owner, memory } = await setup();

      await createPhotoRecord(memory.id, 2);
      await createPhotoRecord(memory.id, 1);

      const media = await getMemoryMedia(owner.id, memory.id);

      expect(media).toHaveLength(2);
      expect(media.map((item) => item.position)).toEqual([1, 2]);
    });

    it("allows the partner to retrieve media", async () => {
      const { owner, partner, memory } = await setup();

      await createPhotoRecord(memory.id, 1);

      const media = await getMemoryMedia(partner.id, memory.id);

      expect(media).toHaveLength(1);
      expect(media[0].memoryId).toBe(memory.id);
    });

    it("returns an empty array when the pin has no media", async () => {
      const { owner, memory } = await setup();

      const media = await getMemoryMedia(owner.id, memory.id);

      expect(media).toEqual([]);
    });

    it("rejects an outsider", async () => {
      const { outsider, memory } = await setup();

      await expect(getMemoryMedia(outsider.id, memory.id)).rejects.toThrow(
        "NOT_BOARD_MEMBER",
      );
    });

    it("rejects a missing pin", async () => {
      const { owner } = await setup();

      await expect(
        getMemoryMedia(owner.id, "00000000-0000-4000-8000-000000000000"),
      ).rejects.toThrow("MEMORY_NOT_FOUND");
    });

    it("rejects access to an archived board", async () => {
      const { owner, board, memory } = await setup();

      await prisma.board.update({
        where: { id: board.id },
        data: { status: "ARCHIVED" },
      });

      await expect(getMemoryMedia(owner.id, memory.id)).rejects.toThrow(
        "BOARD_NOT_FOUND",
      );
    });
  });

  describe("updateMemoryMedia()", () => {
    it("updates the takenAt date", async () => {
      const { owner, memory } = await setup();

      const media = await createPhotoRecord(memory.id, 1);

      const updated = await updateMemoryMedia(owner.id, media.id, {
        takenAt: "2025-12-20",
      });

      expect(updated.takenAt?.toISOString()).toBe("2025-12-20T00:00:00.000Z");
    });

    it("updates the description", async () => {
      const { owner, memory } = await setup();

      const media = await createPhotoRecord(memory.id, 1);

      const updated = await updateMemoryMedia(owner.id, media.id, {
        description: "  Updated description  ",
      });

      expect(updated.description).toBe("Updated description");
    });

    it("allows clearing optional metadata", async () => {
      const { owner, memory } = await setup();

      const media = await prisma.memoryMedia.create({
        data: {
          memoryId: memory.id,
          mediaType: "PHOTO",
          storageKey: "photos/first.jpg",
          takenAt: new Date("2025-12-20T00:00:00.000Z"),
          description: "Description",
          position: 1,
        },
      });

      const updated = await updateMemoryMedia(owner.id, media.id, {
        takenAt: null,
        description: null,
      });

      expect(updated.takenAt).toBeNull();
      expect(updated.description).toBeNull();
    });

    it("updates the media position", async () => {
      const { owner, memory } = await setup();

      const first = await createPhotoRecord(memory.id, 1);
      await createPhotoRecord(memory.id, 2);

      const updated = await updateMemoryMedia(owner.id, first.id, {
        position: 3,
      });

      expect(updated.position).toBe(3);
    });

    it("allows the partner to update media", async () => {
      const { partner, memory } = await setup();

      const media = await createPhotoRecord(memory.id, 1);

      const updated = await updateMemoryMedia(partner.id, media.id, {
        description: "Updated by partner",
      });

      expect(updated.description).toBe("Updated by partner");
    });

    it("rejects an invalid date", async () => {
      const { owner, memory } = await setup();

      const media = await createPhotoRecord(memory.id, 1);

      await expect(
        updateMemoryMedia(owner.id, media.id, {
          takenAt: "2025-02-30",
        }),
      ).rejects.toThrow("INVALID_MEMORY_MEDIA_DATE");
    });

    it("rejects an invalid position", async () => {
      const { owner, memory } = await setup();

      const media = await createPhotoRecord(memory.id, 1);

      await expect(
        updateMemoryMedia(owner.id, media.id, {
          position: 4,
        }),
      ).rejects.toThrow("INVALID_MEMORY_MEDIA_POSITION");
    });

    it("rejects a duplicate position", async () => {
      const { owner, memory } = await setup();

      const first = await createPhotoRecord(memory.id, 1);
      await createPhotoRecord(memory.id, 2);

      await expect(
        updateMemoryMedia(owner.id, first.id, {
          position: 2,
        }),
      ).rejects.toThrow("MEMORY_MEDIA_POSITION_TAKEN");
    });

    it("rejects an outsider", async () => {
      const { outsider, memory } = await setup();

      const media = await createPhotoRecord(memory.id, 1);

      await expect(
        updateMemoryMedia(outsider.id, media.id, {
          description: "Unauthorized",
        }),
      ).rejects.toThrow("NOT_BOARD_MEMBER");
    });

    it("rejects a missing media record", async () => {
      const { owner } = await setup();

      await expect(
        updateMemoryMedia(owner.id, "00000000-0000-4000-8000-000000000000", {
          description: "Updated",
        }),
      ).rejects.toThrow("MEMORY_MEDIA_NOT_FOUND");
    });
  });

  describe("deleteMemoryMedia()", () => {
    it("deletes a media record", async () => {
      const { owner, memory } = await setup();

      const media = await createPhotoRecord(memory.id, 1);

      await deleteMemoryMedia(owner.id, media.id);

      const deleted = await prisma.memoryMedia.findUnique({
        where: { id: media.id },
      });

      expect(deleted).toBeNull();
    });

    it("allows the partner to delete media", async () => {
      const { partner, memory } = await setup();

      const media = await createPhotoRecord(memory.id, 1);

      await deleteMemoryMedia(partner.id, media.id);

      await expect(
        prisma.memoryMedia.findUniqueOrThrow({
          where: { id: media.id },
        }),
      ).rejects.toThrow();
    });

    it("rejects an outsider", async () => {
      const { outsider, memory } = await setup();

      const media = await createPhotoRecord(memory.id, 1);

      await expect(deleteMemoryMedia(outsider.id, media.id)).rejects.toThrow(
        "NOT_BOARD_MEMBER",
      );
    });

    it("rejects a missing media record", async () => {
      const { owner } = await setup();

      await expect(
        deleteMemoryMedia(owner.id, "00000000-0000-4000-8000-000000000000"),
      ).rejects.toThrow("MEMORY_MEDIA_NOT_FOUND");
    });
  });
});
