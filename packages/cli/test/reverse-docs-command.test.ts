import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli-runner.js";

function input() {
  return {
    reverseDocumentationInputVersion: 1,
    repo: { files: [
      { path: "src/auth.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, kind: "code", textSample: "auth", contentFingerprint: "git:auth" },
      { path: "src/session.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, kind: "code", textSample: "session", contentFingerprint: "git:session" },
      { path: "docs/auth.md", extension: ".md", sizeBytes: 10, isSource: false, isTest: false, kind: "documentation", textSample: "human", contentFingerprint: "git:docs" }
    ] },
    architecture: {
      architectureSnapshotVersion: 1,
      fingerprint: "architecture:abc",
      sourceFingerprint: "repo:abc",
      edges: [{ from: "src/session.ts", to: "src/auth.ts" }],
      cycles: [],
      coupling: [
        { path: "src/auth.ts", incoming: 1, outgoing: 0, total: 1 },
        { path: "src/session.ts", incoming: 0, outgoing: 1, total: 1 }
      ],
      boundaryViolations: [],
      truncated: { files: 0, edges: 0 }
    },
    decisions: [],
    targets: [{
      id: "auth-module",
      title: "Authentication module",
      kind: "module",
      paths: ["src/auth.ts", "src/session.ts"],
      requestedPath: "docs/auth.md"
    }]
  };
}

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, dependencies: {
    stdout: (text: string) => stdout.push(text),
    stderr: (text: string) => stderr.push(text)
  } };
}

describe("reverse-docs command", () => {
  it("renders review-only Markdown and deterministic JSON without writing requested destinations", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-reverse-docs-"));
    const path = join(root, "input.json");
    await writeFile(path, JSON.stringify(input()), "utf8");
    const markdown = capture();
    const json = capture();

    expect(await runCli(["reverse-docs", "--input", path], markdown.dependencies)).toBe(0);
    expect(markdown.stdout.join("")).toContain("Requested destination: `docs/auth.md` (occupied-existing-file)");
    expect(markdown.stdout.join("")).toContain("## Observed");
    expect(markdown.stdout.join("")).toContain("No write or overwrite is authorized");

    expect(await runCli(["reverse-docs", `--input=${path}`, "--format", "json"], json.dependencies)).toBe(0);
    expect(JSON.parse(json.stdout.join(""))[0]).toMatchObject({
      reverseDocumentationVersion: 1,
      reviewRequired: true,
      writeAuthorized: false,
      overwriteAuthorized: false,
      destination: { requestedPath: "docs/auth.md", status: "occupied-existing-file" }
    });
  });

  it("rejects missing evidence and input/output collisions", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-reverse-docs-invalid-"));
    const path = join(root, "input.json");
    const invalid = input();
    invalid.targets[0]!.paths = ["src/missing.ts"];
    await writeFile(path, JSON.stringify(invalid), "utf8");
    const missing = capture();
    const collision = capture();

    expect(await runCli(["reverse-docs", "--input", path], missing.dependencies)).toBe(1);
    expect(missing.stderr.join("")).toContain("target path does not exist");
    expect(await runCli(["reverse-docs", "--input", path, "--output", path], collision.dependencies)).toBe(1);
    expect(collision.stderr.join("")).toContain("must not overwrite the input file");
  });

  it("renders clean directory errors", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-reverse-docs-dir-"));
    const directory = join(root, "input");
    await mkdir(directory);
    const io = capture();

    expect(await runCli(["reverse-docs", "--input", directory], io.dependencies)).toBe(1);
    expect(io.stderr.join("")).toContain("is a directory; provide a file path");
    expect(io.stderr.join("")).not.toContain("EISDIR");
  });
});
