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

  it("drops stop words and stem fragments that would produce weak matches", () => {
    const signals = extractTaskSignals({
      issueText: "Deploying to Vercel succeeds but the site returns 404 and the API does not respond"
    });

    expect(signals.tokens.has("deploy")).toBe(true);
    expect(signals.tokens.has("vercel")).toBe(true);
    expect(signals.tokens.has("404")).toBe(true);
    expect(signals.tokens.has("not")).toBe(false);
    expect(signals.tokens.has("does")).toBe(false);
    expect(signals.tokens.has("doe")).toBe(false);
    expect(signals.tokens.has("but")).toBe(false);
  });

  it("keeps bounded code-shaped identifiers and an unterminated exact literal", () => {
    const signals = extractTaskSignals({
      issueText: 'cidrv6 fails after safeParse(); ignore generic `level`\n// "pattern": "^(([0-9a-fA-F]{1'
    });

    expect(signals.identifiers).toContain("cidrv6");
    expect(signals.identifiers).toContain("safeParse");
    expect(signals.identifiers).not.toContain("level");
    expect(signals.exactFragments).toContain("^(([0-9a-fA-F]{1");
  });

  it("caps definition signals for large task descriptions", () => {
    const identifiers = Array.from({ length: 40 }, (_, index) => `signalName${index}`).join(" ");
    const fragments = Array.from({ length: 20 }, (_, index) => `"^literal-${index}$"`).join(" ");
    const signals = extractTaskSignals({ issueText: `${identifiers}\n${fragments}` });

    expect(signals.identifiers.size).toBe(24);
    expect(signals.exactFragments).toHaveLength(8);
  });
});
