import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createGraphIdentity, type FixMapReport, type PlanAlternative } from "@aryam/fixmap-core";
import { planAlternativeFromReport, runAlternativesCommand } from "../src/alternatives-command.js";

const file = (path: string) => createGraphIdentity({ workspace: "local", kind: "file", key: path });

function alternative(id: string, overrides: Partial<PlanAlternative> = {}): PlanAlternative {
  return {
    planAlternativeVersion: 1,
    id,
    graphFingerprint: "graph:abcdef",
    edits: [file("src/a.ts")],
    impacts: [],
    contracts: [],
    policyFindings: [],
    tests: [{ command: "npm test", covers: [file("src/a.ts")], reason: "covers a" }],
    reversibility: { mode: "full", reason: "source only", rollbackSteps: ["git revert"] },
    uncertainties: [],
    ...overrides
  };
}

function report(overrides: Partial<FixMapReport> = {}): FixMapReport {
  return {
    reportVersion: 1,
    summary: "Fix checkout",
    contextFiles: [{ rank: 1, path: "src/checkout.ts", score: 10, confidence: "high", reasons: ["named in task"] }],
    testRoutes: [{ command: "npm test -- checkout", kind: "test", reason: "tests import checkout", relatedFiles: ["test/checkout.test.ts"] }],
    risks: [],
    impact: {
      seeds: ["src/checkout.ts"],
      files: [{ path: "test/checkout.test.ts", score: 5, confidence: "high", evidence: [{ kind: "test-route", seed: "src/checkout.ts", reason: "routed test" }] }],
      inspectionOrder: ["src/checkout.ts", "test/checkout.test.ts"],
      history: { available: false, eligibleCommits: 0, shallow: false, truncated: false }
    },
    changedFiles: [],
    diagnostics: [],
    ...overrides
  };
}

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (value: string) => stdout.push(value), stderr: (value: string) => stderr.push(value) } };
}

async function writeJson(name: string, value: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "fixmap-alternatives-"));
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(value));
  return path;
}

describe("fixmap alternatives", () => {
  it("compares inputs side by side and states trade-offs without naming a winner", async () => {
    const narrow = alternative("narrow", { uncertainties: [{ id: "u1", severity: "high", detail: "unverified caller" }] });
    const broad = alternative("broad", {
      edits: [file("src/a.ts"), file("src/b.ts")],
      tests: [{ command: "npm test", covers: [file("src/a.ts"), file("src/b.ts")], reason: "covers both" }]
    });
    const input = await writeJson("alternatives.json", { alternativesInputVersion: 1, alternatives: [narrow, broad] });

    const json = capture();
    expect(await runAlternativesCommand(["--input", input, "--format", "json"], json.io)).toBe(0);
    const comparison = JSON.parse(json.stdout.join(""));
    expect(comparison).toMatchObject({ alternativePlanComparisonVersion: 1, graphFingerprint: "graph:abcdef" });
    expect(comparison.alternatives.map((entry: { id: string }) => entry.id)).toEqual(["broad", "narrow"]);
    expect(comparison.nonDominatedAlternatives).toEqual(["broad", "narrow"]);

    const markdown = capture();
    expect(await runAlternativesCommand(["--input", input], markdown.io)).toBe(0);
    const text = markdown.stdout.join("");
    expect(text).toContain("FixMap does not pick a winner");
    expect(text).toContain("| Total blast radius (lower is better) | 2 | 1 |");
    expect(text).toContain("`broad` is better on edits with test coverage (2 vs 1), high uncertainties (0 vs 1).");
    expect(text).toContain("`narrow` is better on intended edits (1 vs 2), total blast radius (1 vs 2).");
    expect(text).not.toMatch(/recommend|winner is|best plan/i);
  });

  it("builds alternatives from saved plan reports with an explicit graph fingerprint", async () => {
    const small = await writeJson("small.json", report());
    const wideReport = report({
      contextFiles: [
        { rank: 1, path: "src/checkout.ts", score: 10, confidence: "high", reasons: ["named"] },
        { rank: 2, path: "src/cart.ts", score: 8, confidence: "medium", reasons: ["imports"] }
      ],
      impact: undefined,
      risks: [{ area: "payments", reason: "touches billing", severity: "high" }],
      policy: { policyFingerprint: `git:${"a".repeat(40)}`, findings: [{ code: "breaking-contract", severity: "error", ruleId: "api-stability", message: "Public API changed", paths: ["src/cart.ts"], evidence: [] }] }
    });
    const wide = await writeJson("wide.json", wideReport);

    const io = capture();
    expect(await runAlternativesCommand(["--report", small, "--report", wide, "--graph-fingerprint", "commit:0123456789", "--format", "json"], io.io), io.stderr.join("")).toBe(0);
    const comparison = JSON.parse(io.stdout.join(""));
    expect(comparison.graphFingerprint).toBe("commit:0123456789");
    const byId = Object.fromEntries(comparison.alternatives.map((entry: { id: string; metrics: unknown }) => [entry.id, entry.metrics]));
    expect(byId.small).toMatchObject({ editIdentities: 1, impactIdentities: 1, coveredEditIdentities: 1, breakingContracts: 0, policyErrors: 0 });
    expect(byId.wide).toMatchObject({ editIdentities: 2, breakingContracts: 1, policyErrors: 1, highUncertainties: 1, coveredEditIdentities: 0 });
    expect(comparison.nonDominatedAlternatives).toEqual(["small"]);

    const adapted = planAlternativeFromReport(wideReport, { id: "wide", graphFingerprint: "commit:0123456789" });
    expect(adapted.contracts).toEqual([{ identity: file("src/cart.ts"), compatibility: "breaking", reason: "Public API changed" }]);
    expect(adapted.reversibility.mode).toBe("partial");

    const missing = capture();
    expect(await runAlternativesCommand(["--report", small, "--report", wide], missing.io)).toBe(1);
    expect(missing.stderr.join("")).toContain("requires a graph fingerprint");
  });

  it("rejects alternatives planned against different graph fingerprints", async () => {
    const input = await writeJson("mismatch.json", {
      alternativesInputVersion: 1,
      alternatives: [alternative("a"), alternative("b", { graphFingerprint: "graph:other1" })]
    });
    const io = capture();
    expect(await runAlternativesCommand(["--input", input], io.io)).toBe(1);
    expect(io.stderr.join("")).toContain("same exact graph fingerprint");

    const mixed = await writeJson("one.json", { alternativesInputVersion: 1, alternatives: [alternative("a")] });
    const plan = await writeJson("plan.json", report());
    const mixedIo = capture();
    expect(await runAlternativesCommand(["--input", mixed, "--report", plan, "--graph-fingerprint", "commit:different"], mixedIo.io)).toBe(1);
    expect(mixedIo.stderr.join("")).toContain("same exact graph fingerprint");
  });

  it("refuses to overwrite an input and rejects unknown options", async () => {
    const input = await writeJson("alternatives.json", { alternativesInputVersion: 1, alternatives: [alternative("a"), alternative("b")] });
    const overwrite = capture();
    expect(await runAlternativesCommand(["--input", input, "--output", input], overwrite.io)).toBe(1);
    expect(overwrite.stderr.join("")).toContain("must not overwrite");
    expect(JSON.parse(await readFile(input, "utf8")).alternativesInputVersion).toBe(1);

    const unknown = capture();
    expect(await runAlternativesCommand(["--input", input, "--score"], unknown.io)).toBe(1);
    expect(unknown.stderr.join("")).toContain("Unknown alternatives option");
  });
});
