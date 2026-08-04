import { describe, expect, it } from "vitest";
import { classifyExpectedPathMention, splitCohorts } from "../../../scripts/lib/expected-path-mention.mjs";

// This classifier decides which cohort a benchmark case is reported in, so a silent change
// here silently changes a published rate. Each case below is drawn from a real shape seen in
// benchmarks/*/dataset.json.

describe("expected fixing path mentions", () => {
  it("detects a path stated inline with a line number", () => {
    const result = classifyExpectedPathMention({
      task: "**Location:** lib/document.js:2339 (isModified -> modifiedPaths rebuild)",
      expected: ["lib/document.js"]
    });
    expect(result.mentionsExpectedPath).toBe(true);
    expect(result.mentionTier).toBe("full-path");
  });

  it("detects a path inside a GitHub blob permalink", () => {
    // The `/` before the path belongs to the URL, not to a longer different path. Rejecting
    // this shape once hid two genuine leaks that name the exact file *and* the exact lines.
    const result = classifyExpectedPathMention({
      task: "see https://github.com/sveltejs/svelte/blob/4a6a85b/packages/svelte/src/boundary.js#L200-L210 for the no-op",
      expected: ["packages/svelte/src/boundary.js"]
    });
    expect(result.mentionsExpectedPath).toBe(true);
    expect(result.mentionTier).toBe("full-path");
  });

  it("treats a multi-segment path suffix as named", () => {
    const result = classifyExpectedPathMention({
      task: "Error: src/query/react/buildHooks.ts(1823,13): error TS2345",
      expected: ["packages/toolkit/src/query/react/buildHooks.ts"]
    });
    expect(result.mentionsExpectedPath).toBe(true);
    expect(result.mentionTier).toBe("path-suffix");
  });

  it("does not treat a longer, different path as a mention", () => {
    const result = classifyExpectedPathMention({
      task: "the failing assertion lives in test/lib/request.js",
      expected: ["lib/request.js"]
    });
    expect(result.mentionsExpectedPath).toBe(false);
  });

  it("does not treat a bare basename as naming the file", () => {
    // "index.ts" is ordinary prose in an issue; counting it would move real cases out of the
    // generalization cohort on the strength of a filename that names nothing.
    const result = classifyExpectedPathMention({
      task: "the transports option array is mutated before index.ts reads it",
      expected: ["packages/engine.io-client/lib/index.ts"]
    });
    expect(result.mentionsExpectedPath).toBe(false);
    expect(result.mentionTier).toBe("basename");
  });

  it("does not match a longer filename that merely starts with the expected one", () => {
    const result = classifyExpectedPathMention({
      task: "the regression is in lib/document.jsx",
      expected: ["lib/document.js"]
    });
    expect(result.mentionsExpectedPath).toBe(false);
  });

  it("reports no mention when the task never names the file", () => {
    const result = classifyExpectedPathMention({
      task: "xunit reporter does not strip ansi escape sequences from failure messages",
      expected: ["lib/reporters/xunit.js"]
    });
    expect(result.mentionsExpectedPath).toBe(false);
    expect(result.mentionTier).toBe("none");
  });

  it("normalises Windows separators pasted from a stack trace", () => {
    const result = classifyExpectedPathMention({
      task: "at Object.<anonymous> (lib\\winston\\transports\\file.js:120:15)",
      expected: ["lib/winston/transports/file.js"]
    });
    expect(result.mentionsExpectedPath).toBe(true);
  });

  it("carries evidence so a classification can be audited rather than trusted", () => {
    const result = classifyExpectedPathMention({
      task: "**Location:** lib/document.js:2339 rebuilds the set",
      expected: ["lib/document.js"]
    });
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].context).toContain("lib/document.js");
  });

  it("splits cohorts so named cases never enter the generalization number", () => {
    const cohorts = splitCohorts([
      { slug: "a", mentionsExpectedPath: true },
      { slug: "b", mentionsExpectedPath: false },
      { slug: "c", mentionsExpectedPath: false }
    ]);
    expect(cohorts.all).toHaveLength(3);
    expect(cohorts.unmentioned.map((row) => row.slug)).toEqual(["b", "c"]);
    expect(cohorts.mentioned.map((row) => row.slug)).toEqual(["a"]);
  });
});
