import { describe, expect, it } from "vitest";
import { parseDecisionRecord, type DecisionRecord } from "../src/decisions.js";
import { checkVerifyNarrative, verifyPlan } from "../src/verify.js";
import type { FixMapReport, RepoMap } from "../src/types.js";

const adr = (status: string, decision: string) => [
  "# 1. Control plane boundary",
  "",
  "## Status",
  "",
  status,
  "",
  "## Decision",
  "",
  decision
].join("\n");

function parse(status: string, decision: string): DecisionRecord {
  const parsed = parseDecisionRecord({ path: "docs/adr/0001-boundary.md", content: adr(status, decision), fingerprint: `git:${"a".repeat(40)}` });
  if (!parsed.record) throw new Error(JSON.stringify(parsed.diagnostic));
  return parsed.record;
}

function narrate(decisions: DecisionRecord[]) {
  const repo: RepoMap = {
    root: "/r", packageScripts: [], diffText: "", packageManager: "npm", diagnostics: [],
    changedFiles: ["src/a.ts"],
    files: [{ path: "src/a.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, kind: "code", textSample: "export const a = 1;\n", textSampleComplete: true }]
  };
  const report: FixMapReport = {
    reportVersion: 1, summary: "s", testRoutes: [], risks: [], changedFiles: [], diagnostics: [],
    contextFiles: [{ rank: 1, path: "src/a.ts", score: 1, confidence: "high", reasons: ["task match"] }],
    decisions
  };
  return verifyPlan(report, repo).narrative ?? [];
}

describe("decision records in Verify narration", () => {
  it("reads statuses written with trailing punctuation, as real records do", () => {
    expect(parse("Accepted.", "Keep it.").status).toBe("accepted");
    expect(parse("Accepted;", "Keep it.").status).toBe("accepted");
    expect(parse("Proposed.", "Keep it.").status).toBe("proposed");
    expect(parse("Accepted. Superseded by 0004.", "Keep it.").status).toBe("unknown");
  });

  it("quotes the first sentence of a long record, bounded, and passes the narrative quality check", () => {
    const long = `Coolify v5 splits the control plane from the node agent. ${"The control plane owns user intent, durable state, RBAC, API tokens and audit history, while agents reconcile. ".repeat(12)}`;
    const narrative = narrate([parse("Accepted.", long)]);
    const statement = narrative.find((entry) => entry.evidence.some((evidence) => evidence.kind === "decision-record"))!;
    expect(statement.text).toContain("records an accepted decision");
    expect(statement.text).toContain("Coolify v5 splits the control plane from the node agent. The record has more.");
    expect(statement.text.length).toBeLessThan(500);
    expect(checkVerifyNarrative(narrative)).toEqual([]);
  });

  it("caps a single enormous sentence and uses the right article", () => {
    const run = `Everything ${"and more ".repeat(120)}.`;
    const statement = narrate([parse("Proposed", run)]).find((entry) => entry.evidence.some((evidence) => evidence.kind === "decision-record"))!;
    expect(statement.text).toContain("records a proposed decision");
    expect(statement.text).toMatch(/… The record has more\.$/);
    expect(statement.text.length).toBeLessThan(500);
  });

  it("keeps short single-sentence records whole", () => {
    const statement = narrate([parse("Accepted", "Use the service layer.")])[1]!;
    expect(statement.text.endsWith("relevant to this diff: Use the service layer.")).toBe(true);
  });
});
