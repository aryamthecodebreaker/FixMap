import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli-runner.js";

export function supplyChainBundle() {
  return {
    supplyChainBundleVersion: 1,
    generatedAt: "2026-08-21T12:00:00Z",
    source: {
      tool: "external-scanner",
      toolVersion: "4.2.0",
      databaseVersion: "2026-08-20",
      documentFingerprint: `sha256:${"a".repeat(64)}`
    },
    components: [{
      id: "npm-example-1",
      name: "example",
      version: "1.0.0",
      purl: "pkg:npm/example@1.0.0",
      licenses: ["MIT"],
      paths: ["package-lock.json"]
    }],
    findings: [{
      id: "scanner-advisory-1",
      kind: "vulnerability",
      severity: "high",
      confidence: "high",
      componentId: "npm-example-1",
      summary: "External scanner matched an advisory.",
      advisoryId: "EXTERNAL-1",
      fixedVersion: "1.0.1",
      sourceUrl: "https://scanner.example/advisories/1"
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

describe("supply-chain command", () => {
  it("renders normalized external evidence without claiming FixMap scanned or remediated it", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-supply-chain-"));
    const path = join(root, "bundle.json");
    await writeFile(path, JSON.stringify(supplyChainBundle()), "utf8");
    const markdown = capture();
    const json = capture();

    expect(await runCli(["supply-chain", "--input", path], markdown.dependencies)).toBe(0);
    expect(markdown.stdout.join("")).toContain("**high** vulnerability for `example@1.0.0`");
    expect(markdown.stdout.join("")).toContain("External evidence only");

    expect(await runCli(["supply-chain", `--input=${path}`, "--format", "json"], json.dependencies)).toBe(0);
    const report = JSON.parse(json.stdout.join(""));
    expect(report).toMatchObject({
      supplyChainReportVersion: 1,
      claims: {
        externalEvidenceOnly: true,
        fixMapMaintainsVulnerabilityDatabase: false,
        fixMapExecutedScanner: false,
        remediationAuthorized: false
      }
    });
    expect(report.evidence.items).toContainEqual(expect.objectContaining({ id: "fixmap-supply-chain:finding:scanner-advisory-1" }));
  });

  it("fails closed on unsafe evidence and input/output collisions", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-supply-chain-invalid-"));
    const path = join(root, "bundle.json");
    const unsafe = supplyChainBundle();
    unsafe.findings[0]!.sourceUrl = "ftp://scanner.example/advisories/1";
    await writeFile(path, JSON.stringify(unsafe), "utf8");
    const invalid = capture();
    const collision = capture();

    expect(await runCli(["supply-chain", "--input", path], invalid.dependencies)).toBe(1);
    expect(invalid.stderr.join("")).toContain("Invalid supply-chain finding");
    expect(await runCli(["supply-chain", "--input", path, "--output", path], collision.dependencies)).toBe(1);
    expect(collision.stderr.join("")).toContain("must not overwrite the input file");
  });

  it("renders clean directory errors", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-supply-chain-dir-"));
    const directory = join(root, "input");
    await mkdir(directory);
    const io = capture();
    expect(await runCli(["supply-chain", "--input", directory], io.dependencies)).toBe(1);
    expect(io.stderr.join("")).toContain("is a directory; provide a file path");
    expect(io.stderr.join("")).not.toContain("EISDIR");
  });
});
