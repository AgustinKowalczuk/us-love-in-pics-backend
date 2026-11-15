import type { RequestHandler } from "express";

import { prisma } from "../config/prisma.js";

export const requireVerifiedEmail: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      res.status(401).json({
        status: "error",
        message: "Invalid session",
      });
      return;
    }

    if (!user.emailVerifiedAt) {
      res.status(403).json({
        status: "error",
        message: "Email verification required",
        code: "EMAIL_NOT_VERIFIED",
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};