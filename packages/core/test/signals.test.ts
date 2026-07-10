import { describe, expect, it } from "vitest";
import { extractTaskSignals } from "../src/signals.js";

describe("extractTaskSignals", () => {
  it("tokenizes only added and removed diff lines, not diff metadata", () => {
    const diffText = [
      "diff --git a/src/auth/reset-password.ts b/src/auth/reset-password.ts",
      "index 1234567..89abcde 100644",
      "--- a/src/auth/reset-password.ts",
      "+++ b/src/auth/reset-password.ts",
      "@@ -1,3 +1,3 @@",
      " export function unchangedContext() {}",
      "-const oldTokenExpiry = 3600;",
      "+const newTokenExpiry = 7200;"
    ].join("\n");

    const signals = extractTaskSignals({ diffText });

    expect(signals.tokens.has("token")).toBe(true);
    expect(signals.tokens.has("expiry")).toBe(true);
    expect(signals.tokens.has("index")).toBe(false);
    expect(signals.tokens.has("diff")).toBe(false);
    expect(signals.tokens.has("git")).toBe(false);
    expect(signals.tokens.has("unchanged")).toBe(false);
  });

  it("combines issue text and diff tokens", () => {
    const signals = extractTaskSignals({
      issueText: "password reset fails",
      diffText: "+const resetEmail = true;"
    });

    expect(signals.tokens.has("password")).toBe(true);
    expect(signals.tokens.has("email")).toBe(true);
  });

  it("normalizes simple plural and verb forms", () => {
    const signals = extractTaskSignals({ issueText: "Invoices are created for users" });

    expect(signals.tokens.has("invoice")).toBe(true);
    expect(signals.tokens.has("create")).toBe(true);
    expect(signals.tokens.has("user")).toBe(true);
  });
});
