import { describe, expect, it } from "vitest";
import { buildResetPasswordEmail } from "../../src/auth/reset-password";

describe("buildResetPasswordEmail", () => {
  it("normalizes email addresses before sending reset instructions", () => {
    expect(buildResetPasswordEmail({ email: " USER@example.COM " })).toContain("user@example.com");
  });
});
