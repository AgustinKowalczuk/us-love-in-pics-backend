import { createHash, randomBytes } from "node:crypto";

import { env } from "../../config/env.js";
import { mailer } from "../../config/mailer.js";
import { prisma } from "../../config/prisma.js";

const TOKEN_EXPIRATION_HOURS = 24;

export async function requestEmailVerification(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerifiedAt: true,
    },
  });

  if (!user) throw new Error("USER_NOT_FOUND");

  if (user.emailVerifiedAt) {
    throw new Error("EMAIL_ALREADY_VERIFIED");
  }

  // Generate a cryptographically secure token.
  const token = randomBytes(32).toString("hex");

  // Store only the token hash.
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const expiresAt = new Date(
    Date.now() + TOKEN_EXPIRATION_HOURS * 60 * 60 * 1000,
  );

  const verificationToken = await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.updateMany({
      where: {
        userId,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    return tx.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  });

  const verificationUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;

  try {
    await mailer.sendMail({
      from: env.EMAIL_FROM,
      to: user.email,
      subject: "Verify your Us Love In Pics account",
      text: `Hello ${user.name}, verify your email using this link: ${verificationUrl}`,
      html: `
        <h2>Welcome to Us Love In Pics!</h2>
        <p>Hello ${user.name},</p>
        <p>Please verify your email address by clicking the link below:</p>
        <a href="${verificationUrl}">Verify email</a>
        <p>This link expires in 24 hours.</p>
      `,
    });
  } catch (error) {
    // Invalidate the token if the email could not be sent.
    await prisma.emailVerificationToken.updateMany({
      where: {
        id: verificationToken.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    throw new Error("EMAIL_DELIVERY_FAILED", { cause: error });
  }

  return {
    message: "Verification email sent successfully",
    expiresAt,
  };
}

export async function confirmEmailVerification(token: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const verificationToken = await tx.emailVerificationToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (!verificationToken) {
      throw new Error("INVALID_VERIFICATION_TOKEN");
    }

    if (verificationToken.usedAt) {
      throw new Error("VERIFICATION_TOKEN_ALREADY_USED");
    }

    if (verificationToken.expiresAt <= now) {
      throw new Error("VERIFICATION_TOKEN_EXPIRED");
    }

    // Consume the token only if it is still valid and unused.
    const consumedToken = await tx.emailVerificationToken.updateMany({
      where: {
        id: verificationToken.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        usedAt: now,
      },
    });

    if (consumedToken.count !== 1) {
      throw new Error("INVALID_VERIFICATION_TOKEN");
    }

    const user = await tx.user.update({
      where: { id: verificationToken.userId },
      data: {
        emailVerifiedAt: now,
      },
      select: {
        id: true,
        emailVerifiedAt: true,
      },
    });

    return {
      message: "Email verified successfully",
      user,
    };
  });
}
