
import { describe, expect, it } from "vitest";

import {
  decryptInvitationToken,
  encryptInvitationToken,
} from "../modules/invitations/invitation-crypto.js";

describe("Invitation crypto", () => {
  const originalToken = "test-invitation-token-123456789";

  describe("encryptInvitationToken", () => {
    it("should encrypt a token", () => {
      const encryptedToken = encryptInvitationToken(originalToken);

      expect(encryptedToken).not.toBe(originalToken);
      expect(encryptedToken.startsWith("v1.")).toBe(true);
    });

    it("should generate different encrypted values for the same token", () => {
      const firstEncryption = encryptInvitationToken(originalToken);
      const secondEncryption = encryptInvitationToken(originalToken);

      expect(firstEncryption).not.toBe(secondEncryption);
    });
  });

  describe("decryptInvitationToken", () => {
    it("should restore the original token", () => {
      const encryptedToken = encryptInvitationToken(originalToken);

      const decryptedToken = decryptInvitationToken(encryptedToken);

      expect(decryptedToken).toBe(originalToken);
    });

    it("should reject malformed encrypted values", () => {
      expect(() => decryptInvitationToken("invalid-token")).toThrow(
        "Invalid encrypted invitation token",
      );
    });

    it("should reject an unsupported encryption version", () => {
      const encryptedToken = encryptInvitationToken(originalToken);
      const unsupportedToken = encryptedToken.replace("v1.", "v2.");

      expect(() => decryptInvitationToken(unsupportedToken)).toThrow(
        "Invalid encrypted invitation token",
      );
    });

    it("should reject modified encrypted data", () => {
      const encryptedToken = encryptInvitationToken(originalToken);
      const parts = encryptedToken.split(".");

      const authTag = Buffer.from(parts[2]!, "base64url");
      authTag[0] ^= 0xff;

      parts[2] = authTag.toString("base64url");

      const modifiedToken = parts.join(".");

      expect(() => decryptInvitationToken(modifiedToken)).toThrow();
    });
  });
});
