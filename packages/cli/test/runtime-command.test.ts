import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli-runner.js";

export function runtimeInput() {
  return {
    runtimeInputVersion: 1,
    bundle: {
      runtimeEvidenceBundleVersion: 1,
      source: {
        format: "opentelemetry", tool: "otel-collector", version: "0.130.0",
        documentFingerprint: `sha256:${"a".repeat(64)}`,
        capturedFrom: "2026-08-21T09:00:00Z", capturedTo: "2026-08-21T10:00:00Z",
        redactionReviewed: true, redactionSummary: "Sensitive attributes removed before export."
      },
      records: [{
        kind: "span", id: "span-1", traceId: "a".repeat(32), spanId: "b".repeat(16), name: "POST /login",
        serviceName: "auth", startedAt: "2026-08-21T09:01:00Z", durationMs: 24.5, status: "ok",
        code: { repositoryId: "repo:auth", path: "src/auth.ts", symbol: "authenticate", line: 42, evidenceReference: "span.attr.code.filepath" }
      }]
    },
    snapshots: [{ repositoryId: "repo:auth", files: [{
      path: "src/auth.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, kind: "code", textSample: "work()", contentFingerprint: "git:abc123"
    }] }]
  };
}

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, dependencies: { stdout: (text: string) => stdout.push(text), stderr: (text: string) => stderr.push(text) } };
}

describe("runtime command", () => {
  it("maps observations only through exact repository paths and fingerprints", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-runtime-"));
    const path = join(root, "runtime.json");
    await writeFile(path, JSON.stringify(runtimeInput()), "utf8");
    const markdown = capture();
    const json = capture();

    expect(await runCli(["runtime", "--input", path], markdown.dependencies)).toBe(0);
    expect(markdown.stdout.join("")).toContain("`repo:auth:src/auth.ts` at `git:abc123`");
    expect(markdown.stdout.join("")).toContain("correlation does not establish causality");
    expect(await runCli(["runtime", `--input=${path}`, "--format", "json"], json.dependencies)).toBe(0);
    expect(JSON.parse(json.stdout.join(""))).toMatchObject({
      runtimeEvidenceVersion: 1,
      claims: { spanDurationIsCpuTime: false, profileSamplesAreWallClockTime: false, causalImpactInferred: false }
    });
  });

  it("fails closed when redaction review is absent and prevents input overwrite", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-runtime-invalid-"));
    const path = join(root, "runtime.json");
    const invalid = runtimeInput();
    invalid.bundle.source.redactionReviewed = false;
    await writeFile(path, JSON.stringify(invalid), "utf8");
    const redaction = capture();
    const collision = capture();
    expect(await runCli(["runtime", "--input", path], redaction.dependencies)).toBe(1);
    expect(redaction.stderr.join("")).toContain("Invalid runtime evidence bundle envelope");
    expect(await runCli(["runtime", "--input", path, "--output", path], collision.dependencies)).toBe(1);
    expect(collision.stderr.join("")).toContain("must not overwrite the input file");
  });
});
