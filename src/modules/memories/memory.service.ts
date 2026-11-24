import { prisma } from "../../config/prisma.js";

const MEMORY_LIMITS = {
  NOTE: 6,
  PHOTO: 6,
  GIF: 1,
} as const;

/**
 * Creates a memory after validating board membership and content limits.
 *
 * The board row is locked to prevent concurrent requests from exceeding
 * the configured limit for each memory type.
 */
export async function createMemory(
  userId: string,
  data: {
    boardId: string;
    type: "NOTE" | "PHOTO" | "GIF";
    text?: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    // Lock the board to serialize memory creation requests.
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM boards
      WHERE id = ${data.boardId}::uuid
      FOR UPDATE
    `;

    const board = await tx.board.findFirst({
      where: {
        id: data.boardId,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    if (!board) {
      throw new Error("BOARD_NOT_FOUND");
    }

    const membership = await tx.boardMember.findFirst({
      where: {
        boardId: data.boardId,
        userId,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      throw new Error("NOT_BOARD_MEMBER");
    }

    // Count existing memories of the requested type.
    const existingCount = await tx.memory.count({
      where: {
        boardId: data.boardId,
        type: data.type,
      },
    });

    if (existingCount >= MEMORY_LIMITS[data.type]) {
      throw new Error(`${data.type}_LIMIT_REACHED`);
    }

    return tx.memory.create({
      data: {
        boardId: data.boardId,
        authorId: userId,
        type: data.type,
        text: data.type === "NOTE" ? data.text! : null,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        media: {
          orderBy: {
            position: "asc",
          },
        },
      },
    });
  });
}

/**
 * Retrieves all memories belonging to an active board.
 *
 * Only active board members can access its memories.
 */
export async function getMemories(userId: string, boardId: string) {
  return prisma.$transaction(async (tx) => {
    // Prevent the board from being archived during retrieval.
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM boards
      WHERE id = ${boardId}::uuid
      FOR SHARE
    `;

    const board = await tx.board.findFirst({
      where: {
        id: boardId,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    if (!board) {
      throw new Error("BOARD_NOT_FOUND");
    }

    const membership = await tx.boardMember.findFirst({
      where: {
        boardId,
        userId,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      throw new Error("NOT_BOARD_MEMBER");
    }

    return tx.memory.findMany({
      where: {
        boardId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        media: {
          orderBy: {
            position: "asc",
          },
        },
      },
    });
  });
}

/**
 * Retrieves a memory if the user is an active member of its board.
 */
export async function getMemoryById(userId: string, memoryId: string) {
  const memory = await prisma.memory.findUnique({
    where: {
      id: memoryId,
    },
    select: {
      boardId: true,
    },
  });

  if (!memory) {
    throw new Error("MEMORY_NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    // Prevent the board from being archived during retrieval.
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM boards
      WHERE id = ${memory.boardId}::uuid
      FOR SHARE
    `;

    const board = await tx.board.findFirst({
      where: {
        id: memory.boardId,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    if (!board) {
      throw new Error("BOARD_NOT_FOUND");
    }

    const membership = await tx.boardMember.findFirst({
      where: {
        boardId: memory.boardId,
        userId,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      throw new Error("NOT_BOARD_MEMBER");
    }

    return tx.memory.findUniqueOrThrow({
      where: {
        id: memoryId,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        media: {
          orderBy: {
            position: "asc",
          },
        },
      },
    });
  });
}

/**
 * Updates a memory's text.
 *
 * Any active board member can update a note.
 * Media memories cannot be updated through this operation.
 */
export async function updateMemory(
  userId: string,
  memoryId: string,
  text: string,
) {
  const initialMemory = await prisma.memory.findUnique({
    where: {
      id: memoryId,
    },
    select: {
      boardId: true,
    },
  });

  if (!initialMemory) {
    throw new Error("MEMORY_NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    // Serialize memory modifications with board archival.
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM boards
      WHERE id = ${initialMemory.boardId}::uuid
      FOR UPDATE
    `;

    const board = await tx.board.findFirst({
      where: {
        id: initialMemory.boardId,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    if (!board) {
      throw new Error("BOARD_NOT_FOUND");
    }

    const membership = await tx.boardMember.findFirst({
      where: {
        boardId: initialMemory.boardId,
        userId,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      throw new Error("NOT_BOARD_MEMBER");
    }

    const memory = await tx.memory.findUnique({
      where: {
        id: memoryId,
      },
      select: {
        type: true,
      },
    });

    if (!memory) {
      throw new Error("MEMORY_NOT_FOUND");
    }

    if (memory.type !== "NOTE") {
      throw new Error("MEMORY_NOT_EDITABLE");
    }

    return tx.memory.update({
      where: {
        id: memoryId,
      },
      data: {
        text,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        media: {
          orderBy: {
            position: "asc",
          },
        },
      },
    });
  });
}

/**
 * Deletes a memory if the user is an active member of its board.
 *
 * Associated MemoryMedia records are deleted through the database
 * cascade relation.
 */
export async function deleteMemory(userId: string, memoryId: string) {
  const initialMemory = await prisma.memory.findUnique({
    where: {
      id: memoryId,
    },
    select: {
      boardId: true,
    },
  });

  if (!initialMemory) {
    throw new Error("MEMORY_NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    // Serialize memory deletion with board archival.
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM boards
      WHERE id = ${initialMemory.boardId}::uuid
      FOR UPDATE
    `;

    const board = await tx.board.findFirst({
      where: {
        id: initialMemory.boardId,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    if (!board) {
      throw new Error("BOARD_NOT_FOUND");
    }

    const membership = await tx.boardMember.findFirst({
      where: {
        boardId: initialMemory.boardId,
        userId,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      throw new Error("NOT_BOARD_MEMBER");
    }

    return tx.memory.delete({
      where: {
        id: memoryId,
      },
    });
  });
}
