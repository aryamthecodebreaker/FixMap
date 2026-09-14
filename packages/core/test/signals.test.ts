import { describe, expect, it } from "vitest";
import { extractTaskSignals, redactSensitiveTaskText, tokenizeText } from "../src/signals.js";

describe("extractTaskSignals", () => {
  it("redacts sk-style secrets whose final character is a hyphen", () => {
    const secret = "sk-abcdefghijklmnop-";
    expect(redactSensitiveTaskText(`token=${secret} next`)).toBe("token=[redacted] next");
  });
  it.each([
    ["README typo", "readme"],
    ["fix dockerfile", "dockerfile"],
    ["update CODEOWNERS", "codeowners"]
  ])("recognizes conventional extensionless file mentions in %j", (issueText, expected) => {
    const signals = extractTaskSignals({ issueText });
    expect([...signals.fileMentions].map((mention) => mention.toLowerCase())).toContain(expected);
  });

  it("#515 tokenizes only added diff lines, not removed content or diff metadata", () => {
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
    expect(signals.tokens.has("old")).toBe(false);
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

  it("#514 recognizes member names on arbitrary receivers", () => {
    const signals = extractTaskSignals({ issueText: "config.timeout and user.email are wrong" });

    expect(signals.memberMentions).toEqual(new Set(["timeout", "email"]));
  });

  it("#510 keeps exact quoted error messages and screaming-snake error codes", () => {
    const signals = extractTaskSignals({
      issueText: 'login throws "Cannot read properties of undefined" and `ERR_INVALID_ARG_TYPE`'
    });

    expect(signals.exactFragments).toContain("Cannot read properties of undefined");
    expect(signals.exactFragments).toContain("ERR_INVALID_ARG_TYPE");
  });

  it("#516 does not let contractions swallow a later quoted fragment", () => {
    const signals = extractTaskSignals({ issueText: "it isn't reading `reset-token.ts` correctly" });

    expect(signals.exactFragments).toContain("reset-token.ts");
  });

  it("extracts explicitly called lowercase function names", () => {
    const signals = extractTaskSignals({ issueText: "validate() rejects the correct payload" });

    expect(signals.identifiers).toContain("validate");
  });

  it("does not mistake an ordinary prose word before a spaced parenthesis for a function call", () => {
    const signals = extractTaskSignals({ issueText: "the status code (as logged by the service) is wrong" });

    expect(signals.identifiers).not.toContain("code");
  });

  it.each(["delete", "get", "run", "default", "name", "type", "case"])(
    "#513 keeps ordinary task word %j searchable",
    (word) => expect(tokenizeText(word)).toContain(word)
  );

  it.each(["ci", "ui", "public", "package", "kubernetes"])(
    "keeps product and risk vocabulary %j searchable",
    (word) => expect(tokenizeText(word)).toContain(word)
  );

  it("normalizes hosting to the same searchable deployment token as hosted", () => {
    expect(tokenizeText("hosting")).toEqual(tokenizeText("hosted"));
    expect(tokenizeText("hosting")).toContain("host");
  });

  it.each(["SCSS", "Sass", "Less"])("normalizes %s tasks to CSS paths", (word) => {
    expect(tokenizeText(word)).toContain("css");
  });

  it("tokenizes non-ASCII task text and recognizes a Unicode function name", () => {
    const signals = extractTaskSignals({
      issueText: "修复登录错误 обновитьПрофиль() αποτυγχάνει"
    });

    expect(signals.tokens.size).toBeGreaterThan(0);
    expect(signals.tokens).toContain("修复登录错误");
    expect(signals.identifiers).toContain("обновитьПрофиль");
    expect(signals.tokens).toContain("αποτυγχάνει");
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
  ])("#511/#517 normalizes %s to the same token as %s", (inflected, base) => {
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

  it("never extracts URL credentials or path secrets as reportable identifiers", () => {
    const secret = "superSecretCredentialXYZ";
    const signals = extractTaskSignals({
      issueText: `request fails at "https://user:${secret}@api.example.test/${secret}?token=${secret}"`
    });

    expect([...signals.identifiers].join(" ")).not.toContain(secret);
    expect(signals.exactFragments.join(" ")).not.toContain(secret);
    expect([...signals.tokens].join(" ")).not.toContain(secret.toLowerCase());
  });

  it("ignores issue-template instructions hidden in HTML comments", () => {
    const signals = extractTaskSignals({
      issueText: "xunit output is invalid XML\n<!-- Read .github/CODE_OF_CONDUCT.md before filing -->"
    });

    expect(signals.fileMentions).not.toContain(".github/CODE_OF_CONDUCT.md");
    expect(signals.tokens).not.toContain("conduct");
    expect(signals.tokens).toContain("xunit");
  });

  it("preserves file paths from immutable GitHub blob permalinks", () => {
    const signals = extractTaskSignals({
      issueText:
        "The comment is wrong at https://github.com/sindresorhus/got/blob/e5e645a7d6deeec02933bf474727a541775772c7/source/core/index.ts#L1088-L1089"
    });

    expect(signals.fileMentions).toContain("source/core/index.ts");
    expect(signals.tokens).not.toContain("github");
    expect(signals.tokens).not.toContain("sindresorhus");
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
    expect(signals.uncheckedChecklistLinesRemoved).toBe(1);
  });

  it("preserves unchecked lines when they are the issue's only substantive details", () => {
    const signals = extractTaskSignals({
      issueText: "## Tasks\n- [ ] resetPassword returns the wrong token\n- [ ] sendMail rejects silently"
    });

    expect(signals.identifiers).toContain("resetPassword");
    expect(signals.identifiers).toContain("sendMail");
    expect(signals.uncheckedChecklistLinesPreserved).toBe(2);
    expect(signals.uncheckedChecklistLinesRemoved).toBe(0);
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

describe("plural and verb stems that are part of the word", () => {
  // `pass` -> `pas` matched nothing and, in a short task, removed the only useful term.
  it.each(["pass", "class", "process", "status", "analysis", "basis", "bus"])(
    "keeps %j intact rather than stripping a trailing s that belongs to the word",
    (word) => {
      const tokens = [...tokenizeText(word)];
      expect(tokens.length === 0 || tokens.includes(word)).toBe(true);
    }
  );

  // English doubles a single final consonant to inflect, so a base already ending in `ss`
  // never arrived that way — deduplicating it produced `pas` and `proces`.
  it.each([
    ["pass", "passed"], ["process", "processed"], ["miss", "missed"],
    ["stop", "stopped"], ["ship", "shipped"], ["drop", "dropped"], ["plan", "planned"]
  ])("converges %j and %j on one stem", (base, inflected) => {
    expect([...tokenizeText(inflected)]).toEqual([...tokenizeText(base)]);
  });

  it.each([
    ["validate", "validated"], ["generate", "generated"], ["migrate", "migrated"],
    ["escape", "escaped"], ["merge", "merged"], ["include", "included"],
    ["replace", "replaced"], ["compute", "computed"], ["handle", "handled"],
    ["store", "stored"], ["close", "closed"], ["query", "queried"]
  ])("converges silent-e or -ied forms %j and %j", (base, inflected) => {
    expect([...tokenizeText(inflected)]).toEqual([...tokenizeText(base)]);
  });
});
