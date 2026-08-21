import { describe, expect, it } from "vitest";
import { rankContextFilesHybrid, type EmbeddingProvider } from "../src/semantic.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function file(path: string, textSample: string): RepoFile {
  return {
    path,
    extension: `.${path.split(".").pop()}`,
    sizeBytes: textSample.length,
    isSource: true,
    isTest: false,
    kind: "code",
    textSample
  };
}

function repo(files: RepoFile[]): RepoMap {
  return {
    root: "/repo",
    files,
    packageScripts: [],
    changedFiles: [],
    diffText: "",
    packageManager: "npm",
    diagnostics: []
  };
}

function provider(embed: EmbeddingProvider["embed"], overrides: Partial<EmbeddingProvider> = {}): EmbeddingProvider {
  return {
    id: "local-test",
    version: "1.0.0",
    model: "fixture-mini",
    artifactHash: "a".repeat(64),
    runtime: "fixture/1",
    dimensions: 2,
    normalization: "l2",
    local: true,
    embed,
    ...overrides
  };
}

describe("rankContextFilesHybrid", () => {
  it("uses deterministic structural and lexical fusion when semantics are disabled", async () => {
    const map = repo([
      file("src/email.ts", "export function sendPasswordReset() {}"),
      file("src/session.ts", "export function renewSession() {}")
    ]);

    const first = await rankContextFilesHybrid(map, { issueText: "password reset email" });
    const second = await rankContextFilesHybrid(map, { issueText: "password reset email" });

    expect(first).toEqual(second);
    expect(first.mode).toBe("structural-lexical");
    expect(first.files[0]?.path).toBe("src/email.ts");
    expect(first.diagnostics).toContainEqual(expect.objectContaining({ code: "semantic-disabled" }));
  });

  it("surfaces a paraphrased concept while keeping every signal explainable", async () => {
    const map = repo([
      file("src/account.ts", "export function loadAccount() {}"),
      file("src/session.ts", "export function renewSession() {}")
    ]);
    const embedding = provider(async (texts) => texts.map((text, index) => {
      if (index === 0 || text.startsWith("src/session.ts")) return [1, 0];
      return [0, 1];
    }));

    const result = await rankContextFilesHybrid(
      map,
      { issueText: "keep the signed in person active" },
      { embeddingProvider: embedding }
    );

    expect(result.mode).toBe("structural-lexical-semantic");
    expect(result.files[0]?.path).toBe("src/session.ts");
    expect(result.files[0]?.retrieval).toMatchObject({ semanticRank: 1, semanticSimilarity: 1 });
    expect(result.files[0]?.reasons).toContainEqual(expect.stringContaining("semantic rank #1"));
    expect(result.semantic).toMatchObject({
      artifactHash: "a".repeat(64),
      dimensions: 2,
      normalization: "l2",
      local: true,
      indexedFiles: 2,
      truncatedFiles: 0
    });
  });

  it("does not send source to a remote provider without explicit permission", async () => {
    let calls = 0;
    const remote = provider(async (texts) => {
      calls += 1;
      return texts.map(() => [1, 0]);
    }, { local: false });

    const result = await rankContextFilesHybrid(
      repo([file("src/auth.ts", "export function login() {}")]),
      { issueText: "login fails" },
      { embeddingProvider: remote }
    );

    expect(calls).toBe(0);
    expect(result.mode).toBe("structural-lexical");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "semantic-remote-disallowed" }));
  });

  it("contains invalid provider output and preserves the deterministic fallback", async () => {
    const map = repo([file("src/auth.ts", "export function login() {}")]);
    const invalid = provider(async (texts) => texts.map(() => [1]));

    const result = await rankContextFilesHybrid(map, { issueText: "login fails" }, { embeddingProvider: invalid });

    expect(result.files[0]?.path).toBe("src/auth.ts");
    expect(result.mode).toBe("structural-lexical");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "semantic-provider-failed" }));
  });

  it("records bounded semantic scope instead of silently omitting candidates", async () => {
    const map = repo([
      file("src/a.ts", "export const a = 1"),
      file("src/b.ts", "export const b = 1")
    ]);
    const embedding = provider(async (texts) => texts.map(() => [1, 0]));

    const result = await rankContextFilesHybrid(map, { issueText: "change behavior" }, {
      embeddingProvider: embedding,
      maxSemanticCandidates: 1
    });

    expect(result.semantic).toMatchObject({ indexedFiles: 1, truncatedFiles: 1 });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "semantic-candidates-truncated" }));
  });
});
