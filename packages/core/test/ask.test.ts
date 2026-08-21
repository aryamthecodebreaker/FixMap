import { describe, expect, it } from "vitest";
import { answerFixMapQuestion, buildAskEvidence, type AskModelProvider } from "../src/ask.js";
import type { FixMapReport } from "../src/types.js";

function report(): FixMapReport {
  return {
    reportVersion: 1, summary: "Update authentication", changedFiles: [], diagnostics: [],
    contextFiles: [{ rank: 1, path: "src/auth.ts", score: 10, confidence: "high", reasons: ["task match"] }],
    impact: { seeds: ["src/auth.ts"], files: [{ path: "src/session.ts", score: 4, confidence: "medium",
      evidence: [{ kind: "imports", seed: "src/auth.ts", reason: "imports auth" }] }], inspectionOrder: ["src/session.ts"],
      history: { available: true, eligibleCommits: 10, shallow: false, truncated: false } },
    testRoutes: [{ command: "npm test -- auth", kind: "test", reason: "auth changed", relatedFiles: ["test/auth.test.ts"] }],
    risks: [{ area: "authentication", severity: "high", reason: "auth code changes" }]
  };
}

const localProvider = (response: Awaited<ReturnType<AskModelProvider["answer"]>>): AskModelProvider => ({
  id: "local-test", version: "1", model: "fixture", local: true, answer: async () => response
});

const contextCitation = buildAskEvidence(report()).find((entry) => entry.kind === "context")!.id;

describe("FixMap ask", () => {
  it("answers structural test, impact, risk, and plan questions deterministically with citations", async () => {
    const tests = await answerFixMapQuestion(report(), "Which tests should I run?");
    const impact = await answerFixMapQuestion(report(), "What could this impact?");
    const risk = await answerFixMapQuestion(report(), "What risks exist?");
    const plan = await answerFixMapQuestion(report(), "What should I inspect?");
    expect(tests).toMatchObject({ mode: "deterministic-structural", citations: [{ kind: "test" }], claimsVerified: false });
    expect(impact.citations[0]).toMatchObject({ kind: "impact", path: "src/session.ts" });
    expect(risk.citations[0].kind).toBe("risk");
    expect(plan.citations[0]).toMatchObject({ kind: "context", path: "src/auth.ts" });
  });

  it("does not invent missing design rationale", async () => {
    const answer = await answerFixMapQuestion(report(), "Why was auth designed this way?");
    expect(answer.citations).toEqual([]);
    expect(answer.unknowns[0]).toContain("rationale is unknown");
    expect(answer.answer).toContain("no authored decision record");
  });

  it("accepts a cited local model answer and records reproducible provenance", async () => {
    const provider = localProvider({ text: "Inspect auth first.", citationIds: [contextCitation], unknowns: ["Runtime behavior"] });
    const answer = await answerFixMapQuestion(report(), "Where should I start?", { provider });
    expect(answer).toMatchObject({ mode: "model-assisted", answer: "Inspect auth first.",
      citations: [{ id: contextCitation }], unknowns: ["Runtime behavior"],
      model: { provider: "local-test", local: true } });
    expect(answer.model?.requestFingerprint).toMatch(/^ask-request:[a-f0-9]{16}$/);
    expect(answer.evidenceScope).toBe("report-only-no-source-content");
  });

  it("falls back when a model answer is uncited, cites unknown evidence, or throws", async () => {
    const uncited = await answerFixMapQuestion(report(), "What tests?", { provider: localProvider({ text: "x", citationIds: [], unknowns: [] }) });
    const invented = await answerFixMapQuestion(report(), "What tests?", { provider: localProvider({ text: "x", citationIds: ["made-up"], unknowns: [] }) });
    const failed = await answerFixMapQuestion(report(), "What tests?", { provider: {
      ...localProvider({ text: "x", citationIds: [], unknowns: [] }), answer: async () => { throw new Error("secret provider detail"); }
    } });
    expect(uncited.mode).toBe("deterministic-structural");
    expect(uncited.diagnostics.at(-1)).toContain("invalid or uncited");
    expect(invented.diagnostics.at(-1)).toContain("outside the supplied pack");
    expect(failed.diagnostics.at(-1)).not.toContain("secret provider detail");
  });

  it("requires explicit consent before sending report evidence to a remote provider", async () => {
    let called = false;
    const provider: AskModelProvider = { ...localProvider({ text: "x", citationIds: [contextCitation], unknowns: [] }),
      id: "remote", local: false, answer: async (input) => { called = true; return { text: input.question, citationIds: [contextCitation], unknowns: [] }; } };
    await expect(answerFixMapQuestion(report(), "Where?", { provider })).rejects.toThrow("explicit allowRemoteModel consent");
    expect(called).toBe(false);
    expect((await answerFixMapQuestion(report(), "Where?", { provider, allowRemoteModel: true })).mode).toBe("model-assisted");
  });

  it("bounds evidence text and rejects invalid inputs", async () => {
    const long = report();
    long.contextFiles[0].reasons = ["x".repeat(5_000)];
    const evidence = buildAskEvidence(long)[0];
    expect(evidence).toMatchObject({ truncated: true });
    expect(new TextEncoder().encode(evidence.detail).length).toBeLessThanOrEqual(4_000);
    await expect(answerFixMapQuestion(report(), "")).rejects.toThrow("non-empty question");
    await expect(answerFixMapQuestion({ ...report(), reportVersion: undefined }, "Where?")).rejects.toThrow("explicit reportVersion 1");
  });
});
