
import { prisma } from "../../config/prisma.js";

/**
 * Checks whether a Prisma error represents a unique constraint violation.
 */
function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

/**
 * Creates a board from an accepted invitation.
 *
 * Only the invitation sender can create the board.
 * Both users must have verified emails and must not belong
 * to another active board.
 *
 * User rows are locked in a consistent order to prevent
 * concurrent board creation for the same users.
 */
export async function createBoard(
  userId: string,
  invitationId: string,
) {
  // Retrieve the invitation before starting the transaction
  // to identify the users whose rows must be locked.
  const initialInvitation = await prisma.invitation.findUnique({
    where: {
      id: invitationId,
    },
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      status: true,
    },
  });

  if (!initialInvitation) {
    throw new Error("INVITATION_NOT_FOUND");
  }

  if (initialInvitation.status !== "ACCEPTED") {
    throw new Error("INVITATION_NOT_ACCEPTED");
  }

  if (initialInvitation.senderId !== userId) {
    throw new Error("NOT_INVITATION_SENDER");
  }

  if (!initialInvitation.recipientId) {
    throw new Error("INVITATION_RECIPIENT_NOT_FOUND");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Lock both users in sorted order to avoid deadlocks
      // when concurrent operations affect the same users.
      const userIds = [
        initialInvitation.senderId,
        initialInvitation.recipientId!,
      ].sort();

      for (const lockedUserId of userIds) {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM users
          WHERE id = ${lockedUserId}::uuid
          FOR UPDATE
        `;
      }

      // Re-fetch the invitation after acquiring the locks
      // to ensure its state has not changed.
      const invitation = await tx.invitation.findUnique({
        where: {
          id: invitationId,
        },
        select: {
          id: true,
          senderId: true,
          recipientId: true,
          status: true,
        },
      });

      if (!invitation) {
        throw new Error("INVITATION_NOT_FOUND");
      }

      if (invitation.status !== "ACCEPTED") {
        throw new Error("INVITATION_NOT_ACCEPTED");
      }

      if (invitation.senderId !== userId) {
        throw new Error("NOT_INVITATION_SENDER");
      }

      if (!invitation.recipientId) {
        throw new Error("INVITATION_RECIPIENT_NOT_FOUND");
      }

      // Ensure the invitation still references the users
      // whose rows were locked.
      if (
        invitation.senderId !== initialInvitation.senderId ||
        invitation.recipientId !== initialInvitation.recipientId
      ) {
        throw new Error("INVITATION_USERS_CHANGED");
      }

      // Retrieve both users and verify their email addresses.
      const users = await tx.user.findMany({
        where: {
          id: {
            in: userIds,
          },
        },
        select: {
          id: true,
          name: true,
          emailVerifiedAt: true,
        },
      });

      const sender = users.find(
        (user) => user.id === invitation.senderId,
      );

      const recipient = users.find(
        (user) => user.id === invitation.recipientId,
      );

      if (!sender || !recipient) {
        throw new Error("INVITATION_USER_NOT_FOUND");
      }

      if (!sender.emailVerifiedAt || !recipient.emailVerifiedAt) {
        throw new Error("EMAIL_NOT_VERIFIED");
      }

      // Check whether either user already belongs to an active board.
      const existingMemberships = await tx.boardMember.findMany({
        where: {
          userId: {
            in: userIds,
          },
          status: "ACTIVE",
        },
        select: {
          userId: true,
        },
      });

      if (existingMemberships.length > 0) {
        throw new Error("USER_ALREADY_HAS_ACTIVE_BOARD");
      }

      // Prevent creating more than one board from the same invitation.
      const existingBoard = await tx.board.findUnique({
        where: {
          invitationId: invitation.id,
        },
        select: {
          id: true,
        },
      });

      if (existingBoard) {
        throw new Error("BOARD_ALREADY_EXISTS");
      }

      // Create the board and both memberships atomically.
      const board = await tx.board.create({
        data: {
          name: `${sender.name}&${recipient.name}`,
          status: "ACTIVE",
          photoLimit: 15,
          invitationId: invitation.id,
          archivedAt: null,
          members: {
            create: [
              {
                userId: sender.id,
                role: "OWNER",
                status: "ACTIVE",
              },
              {
                userId: recipient.id,
                role: "PARTNER",
                status: "ACTIVE",
              },
            ],
          },
        },
        include: {
          members: true,
        },
      });

      return board;
    });
  } catch (error) {
    // Convert database unique constraint violations into
    // a service-level error that the controller can handle.
    if (isPrismaUniqueConstraintError(error)) {
      throw new Error("BOARD_CONFLICT");
    }

    throw error;
  }
}

/**
 * Retrieves the authenticated user's active board and its active members.
 */
export async function getMyActiveBoard(userId: string) {
  const membership = await prisma.boardMember.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      board: {
        is: {
          status: "ACTIVE",
        },
      },
    },
    select: {
      board: {
        include: {
          members: {
            where: {
              status: "ACTIVE",
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!membership) {
    throw new Error("ACTIVE_BOARD_NOT_FOUND");
  }

  return membership.board;
}


/**
 * Retrieves a specific active board if the user is an active member.
 *
 * A shared row lock prevents the board from being archived
 * while its data and membership are being retrieved.
 */
export async function getBoardById(userId: string, boardId: string) {
  return prisma.$transaction(async (tx) => {
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
      include: {
        members: {
          where: {
            status: "ACTIVE",
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
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

    return board;
  });
}



/**
 * Archives an active board and all its active memberships.
 *
 * Only an active member can archive the board.
 * A row lock prevents concurrent archive operations.
 * All changes are performed atomically.
 */
export async function archiveBoard(userId: string, boardId: string) {
  return prisma.$transaction(async (tx) => {
    // Lock the board row to serialize concurrent archive operations.
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM boards
      WHERE id = ${boardId}::uuid
      FOR UPDATE
    `;

    const board = await tx.board.findUnique({
      where: {
        id: boardId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!board || board.status !== "ACTIVE") {
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

    const archivedAt = new Date();

    await tx.board.update({
      where: {
        id: boardId,
      },
      data: {
        status: "ARCHIVED",
        archivedAt,
        members: {
          updateMany: {
            where: {
              status: "ACTIVE",
            },
            data: {
              status: "ARCHIVED",
              archivedAt,
            },
          },
        },
      },
    });

    return tx.board.findUniqueOrThrow({
      where: {
        id: boardId,
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  });
}
