import type { RequestHandler } from "express";

import {
  requestEmailVerification,
  confirmEmailVerification,
} from "./email-verification.service.js";

export const requestVerificationController: RequestHandler = async (
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

    const result = await requestEmailVerification(userId);

    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case "USER_NOT_FOUND":
          res.status(404).json({
            status: "error",
            message: "User not found",
          });
          return;

        case "EMAIL_ALREADY_VERIFIED":
          res.status(409).json({
            status: "error",
            message: "Email is already verified",
          });
          return;

        case "EMAIL_DELIVERY_FAILED":
          res.status(502).json({
            status: "error",
            message: "Unable to send verification email",
          });
          return;
      }
    }

    next(error);
  }
};

export const confirmVerificationController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const { token } = req.body;

    const result = await confirmEmailVerification(token);

    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case "INVALID_VERIFICATION_TOKEN":
          res.status(400).json({
            status: "error",
            message: "Invalid verification token",
          });
          return;

        case "VERIFICATION_TOKEN_ALREADY_USED":
          res.status(409).json({
            status: "error",
            message: "Verification token has already been used",
          });
          return;

        case "VERIFICATION_TOKEN_EXPIRED":
          res.status(410).json({
            status: "error",
            message: "Verification token has expired",
          });
          return;
      }
    }

    next(error);
  }
};
