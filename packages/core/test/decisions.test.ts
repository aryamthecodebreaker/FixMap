import { describe, expect, it } from "vitest";
import { inventoryDecisionRecords, parseDecisionRecord, selectDecisionRecords } from "../src/decisions.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function file(path: string, textSample: string, complete = true): RepoFile {
  return {
    path,
    contentFingerprint: `worktree:${"a".repeat(64)}`,
    extension: ".md",
    sizeBytes: textSample.length,
    isTest: false,
    isSource: true,
    kind: "documentation",
    textSample,
    textSampleComplete: complete,
    ...(!complete ? { textSampleSkipReason: "too-large" as const } : {})
  };
}

function repo(files: RepoFile[]): RepoMap {
  return { root: "/repo", files, packageScripts: [], changedFiles: [], diffText: "", packageManager: "npm", diagnostics: [] };
}

describe("decision records", () => {
  it.each([
    ["not accepted", "unknown"], ["unapproved", "unknown"], ["inactive", "unknown"],
    ["Accepted, later superseded", "unknown"], ["Superseded (previously accepted)", "unknown"],
    ["**Accepted**", "accepted"], ["Proposed", "proposed"],
    ["Superseded by ADR-004", "superseded"], ["Rejected", "rejected"]
  ])("reads status %s conservatively as %s", (status, expected) => {
    const record = parseDecisionRecord({ path: "docs/adr/1.md", fingerprint: "git:abc", content: `# Boundary\n## Status\n${status}\n## Decision\nKeep the boundary.` }).record;
    expect(record?.status).toBe(expected);
  });
  it("ingests local PR exports verbatim without inferring approval from merge metadata", () => {
    const body = "We should keep `src/token.ts` opaque.\n\nThis is a proposal.\n";
    const inventory = inventoryDecisionRecords(repo([
      file("src/token.ts", "token"),
      file("docs/decisions/pr-42.json", JSON.stringify({ title: "Token boundary", body, url: "https://github.com/acme/auth/pull/42", state: "MERGED", fixmapAppliesTo: "service:identity" })),
      file("docs/decisions/bad.json", JSON.stringify({ title: "Empty", body: "", url: "https://github.com/acme/auth/pull/43" }))
    ]));
    expect(inventory.records).toHaveLength(1);
    expect(inventory.records[0]).toMatchObject({ decision: body, status: "unknown", source: { verification: "unverified-local-attribution" } });
    expect(inventory.records[0]?.targets).toEqual(expect.arrayContaining([
      { kind: "file", path: "src/token.ts", evidence: "literal-mention" },
      { kind: "service", name: "identity", evidence: "explicit" }
    ]));
    expect(inventory.diagnostics).toContainEqual(expect.objectContaining({ code: "decision-parse-failed", path: "docs/decisions/bad.json" }));
  });
  it("preserves explicit local PR attribution without claiming remote verification", () => {
    const content = "---\nfixmap-source-pr: https://github.com/acme/auth/pull/42\n---\n# Boundary\n## Decision\nKeep the boundary.";
    const record = parseDecisionRecord({ path: "docs/adr/42.md", content, fingerprint: "git:abc" }).record;
    expect(record?.source).toEqual({ kind: "pull-request", url: "https://github.com/acme/auth/pull/42", verification: "unverified-local-attribution" });
    for (const url of ["ftp://github.com/acme/auth/pull/42", "https://github.com/acme/auth/issues/42", "https://github.com/acme/auth/pull/42?token=secret", "https://github.com/../auth/pull/42"]) {
      expect(() => parseDecisionRecord({ path: "docs/adr/42.md", content: content.replace("https://github.com/acme/auth/pull/42", url), fingerprint: "git:abc" })).toThrow("Invalid decision pull-request source");
    }
  });
  it("isolates malformed records without losing valid decisions or echoing invalid content", () => {
    const inventory = inventoryDecisionRecords(repo([
      file("docs/adr/traversal.md", "---\nfixmap-applies-to: file:../private-secret\n---\n# Invalid target\n## Decision\nKeep it."),
      file("docs/adr/oversized.md", `# Too long\n## Decision\n${"x".repeat(8_001)}`),
      file("docs/adr/nul.md", "# Invalid prose\n## Decision\nprivate-secret\0"),
      file("docs/adr/valid.md", "# Valid record\n## Decision\nKeep the boundary.")
    ]));
    expect(inventory.records.map((record) => record.path)).toEqual(["docs/adr/valid.md"]);
    expect(inventory.diagnostics).toHaveLength(3);
    expect(inventory.diagnostics.every((diagnostic) => diagnostic.code === "decision-parse-failed")).toBe(true);
    expect(JSON.stringify(inventory.diagnostics)).not.toContain("private-secret");
  });
  it("preserves decision subsections and ignores fenced example headings", () => {
    const content = "# Real ADR\n\n## Decision\nKeep the interface.\n### Compatibility\nKeep old clients working.\n```md\n## Consequences\nThis is an example, not a section.\n```\n## Consequences\nExtra maintenance.\n";
    const result = parseDecisionRecord({ path: "docs/adr/1.md", content, fingerprint: "git:abc" });
    expect(result.record?.decision).toContain("### Compatibility\nKeep old clients working.");
    expect(result.record?.decision).toContain("This is an example, not a section.");
    expect(result.record?.consequences).toBe("Extra maintenance.");
    expect(parseDecisionRecord({ path: "docs/adr/2.md", content: "# Example only\n```md\n## Decision\nNot an authored decision.\n```", fingerprint: "git:abc" }).record).toBeUndefined();
  });
  it("preserves authored context, decision, consequences, status, and explicit targets", () => {
    const content = `---
status: accepted
date: 2024-02-03
fixmap-applies-to: file:src/auth/token.ts, service:identity
---
# ADR 004: Keep opaque access tokens

## Context
The external identity provider owns token structure.

## Decision
Treat access tokens as opaque and validate them through the provider.

## Consequences
Local parsing is forbidden even when it appears faster.
`;
    const result = parseDecisionRecord({ path: "docs/adr/004-tokens.md", content, fingerprint: "content:1234567890abcdef" });
    expect(result.record).toEqual(expect.objectContaining({
      title: "ADR 004: Keep opaque access tokens",
      status: "accepted",
      date: "2024-02-03",
      context: expect.stringContaining("provider owns"),
      decision: expect.stringContaining("opaque"),
      consequences: expect.stringContaining("forbidden"),
      sourceFingerprint: "content:1234567890abcdef"
    }));
    expect(result.record?.targets).toEqual(expect.arrayContaining([
      { kind: "file", path: "src/auth/token.ts", evidence: "explicit" },
      { kind: "service", name: "identity", evidence: "explicit" }
    ]));
  });

  it("attaches literal path mentions only when the repository actually contains them", () => {
    const content = "# Use a token boundary\n\n## Decision\nKeep `src/auth/token.ts` stable, not `invented/path.ts`.\n";
    const result = parseDecisionRecord({
      path: "docs/architecture/decisions/token.md",
      content,
      fingerprint: "content:1234567890abcdef",
      knownPaths: new Set(["src/auth/token.ts"])
    });
    expect(result.record?.targets).toEqual([{ kind: "file", path: "src/auth/token.ts", evidence: "literal-mention" }]);
  });

  it("discovers ADR and rationale paths while diagnosing incomplete and malformed candidates", () => {
    const inventory = inventoryDecisionRecords(repo([
      file("src/auth/token.ts", "code"),
      file("docs/adr/001.md", "# Token decision\n\n## Decision\nKeep `src/auth/token.ts` stable.\n"),
      file("docs/adr/002.md", "---\nfixmap-applies-to:\n  - file:src/missing.ts\n  - service:payments\n---\n# Missing target\n\n## Decision\nKeep the old boundary.\n"),
      file("docs/design/huge.md", "", false),
      file("docs/architecture.md", "# Overview only\n")
    ]));
    expect(inventory.records).toHaveLength(2);
    expect(inventory.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "decision-source-incomplete", path: "docs/design/huge.md" }),
      expect.objectContaining({ code: "decision-parse-failed", path: "docs/architecture.md" }),
      expect.objectContaining({ code: "decision-target-missing", path: "docs/adr/002.md" })
    ]));
    expect(inventory.records.find((record) => record.path === "docs/adr/002.md")?.targets)
      .toContainEqual({ kind: "service", name: "payments", evidence: "explicit" });
  });

  it("selects decisions by ranked paths, explicit service names, or meaningful title terms", () => {
    const inventory = inventoryDecisionRecords(repo([
      file("src/auth/token.ts", "code"),
      file("docs/adr/token.md", "# Opaque token validation\n\n## Applies to\nservice: identity\n\n## Decision\nKeep `src/auth/token.ts` stable.\n")
    ]));
    expect(selectDecisionRecords(inventory, { paths: ["src/auth/token.ts"], task: "unrelated" })).toHaveLength(1);
    expect(selectDecisionRecords(inventory, { paths: [], task: "identity login" })).toHaveLength(1);
    expect(selectDecisionRecords(inventory, { paths: [], task: "opaque token bug" })).toHaveLength(1);
  });

  it("fails closed on traversal and documents missing required sections", () => {
    expect(() => parseDecisionRecord({ path: "../adr.md", content: "# ADR\n## Decision\nX", fingerprint: "content:1234567890abcdef" }))
      .toThrow("Invalid decision path");
    const result = parseDecisionRecord({ path: "docs/adr/empty.md", content: "# ADR without resolution", fingerprint: "content:1234567890abcdef" });
    expect(result.record).toBeUndefined();
    expect(result.diagnostic?.code).toBe("decision-parse-failed");
  });
});
