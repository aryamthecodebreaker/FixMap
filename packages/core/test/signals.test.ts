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

  it.each([
    ["failed", "fail"],
    ["boxes", "box"],
    ["routing", "route"],
    ["parsing", "parse"],
    ["running", "run"],
    // Four-letter bases ending in "e": the base keeps its "e" while the inflected
    // form stems one character shorter unless normalizeTrailingE covers both.
    ["based", "base"],
    ["filed", "file"],
    ["files", "file"],
    ["dated", "date"],
    ["sized", "size"],
    ["timed", "time"],
    ["coding", "code"],
    ["lines", "line"],
    // Longer "e" bases and doubled consonants, so the rules cannot drift apart again.
    ["cached", "cache"],
    ["stopped", "stop"],
    ["created", "create"],
    ["contributing", "contribute"],
    ["contributor", "contribute"],
    ["invoices", "invoice"],
    ["resolved", "resolve"]
  ])("normalizes %s to the same token as %s", (inflected, base) => {
    const inflectedSignals = extractTaskSignals({ issueText: inflected });
    const baseSignals = extractTaskSignals({ issueText: base });

    expect(inflectedSignals.tokens).toEqual(baseSignals.tokens);
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

  it("does not turn URLs into ranking terms", () => {
    const signals = extractTaskSignals({
      issueText: "see https://github.com/chalk/chalk/pull/1 for color support on windows"
    });

    expect(signals.tokens).not.toContain("http");
    expect(signals.tokens).not.toContain("com");
    expect(signals.tokens).not.toContain("pull");
    expect(signals.tokens).toContain("color");
    expect(signals.tokens).toContain("window");
  });

  it("keeps short trailing-e words readable instead of emitting three-letter stems", () => {
    const signals = extractTaskSignals({ issueText: "files site make" });

    expect(signals.tokens).toContain("file");
    expect(signals.tokens).toContain("site");
    expect(signals.tokens).not.toContain("fil");
    expect(signals.tokens).not.toContain("sit");
    expect(signals.tokens).not.toContain("mak");
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

  it("separates source-file mentions from dotted member expressions", () => {
    const signals = extractTaskSignals({
      issueText: "request.port disagrees with src/http/request.ts and window.print is not mocked"
    });

    expect(signals.fileMentions).toEqual(new Set(["src/http/request.ts"]));
    expect(signals.memberMentions).toEqual(new Set(["port", "print"]));
  });

  it("normalizes HTTP/2 to the h2 path token", () => {
    const signals = extractTaskSignals({
      issueText: "aborted HTTP/2 client requests leak memory"
    });

    expect(signals.tokens).toContain("h2");
  });

  it("drops unchecked issue-template options while retaining the selected package", () => {
    const signals = extractTaskSignals({
      issueText: [
        "- [ ] `@eslint/core`",
        "- [x] `@eslint/config-helpers`",
        "Alias Config in the selected package"
      ].join("\n")
    });

    expect(signals.exactFragments).not.toContain("@eslint/core");
    expect(signals.exactFragments).toContain("@eslint/config-helpers");
  });

  it("stays linear on a long unbroken run instead of backtracking quadratically", () => {
    // The file-mention pattern's body run contains ".", so it competed with the "\." that
    // follows it: on an unbroken run with no extension the engine matched the whole run,
    // failed, and retried one character shorter from every start position. 30,000
    // characters took 2.4 seconds, and the Action feeds this pattern issue text from
    // public pull requests. Scaling is what this asserts, not absolute time, since CI
    // machines vary too much for a millisecond budget to mean anything.
    const measure = (length: number) => {
      const text = `flurbulator ${"z".repeat(length)} telemetry`;
      const started = performance.now();
      extractTaskSignals({ issueText: text });
      return performance.now() - started;
    };

    measure(20_000);
    const small = Math.max(measure(20_000), 1);
    const large = measure(80_000);

    // Four times the input must not cost anything like sixteen times the work.
    expect(large / small).toBeLessThan(8);
  });

  it("ignores a token too long to be a real search term", () => {
    const signals = extractTaskSignals({ issueText: `reset ${"z".repeat(5_000)} password` });

    expect(signals.tokens).toContain("reset");
    expect([...signals.tokens].every((token) => token.length <= 64)).toBe(true);
  });
});
