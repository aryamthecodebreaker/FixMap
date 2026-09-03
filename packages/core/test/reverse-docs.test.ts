import { describe, expect, it } from "vitest";
import { draftReverseDocumentation } from "../src/reverse-docs.js";
import type { ArchitectureSnapshot } from "../src/architecture.js";
import type { RepoMap } from "../src/types.js";

const repo = (): Pick<RepoMap, "files"> => ({ files: [
  { path: "src/auth.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, kind: "code", textSample: "auth", contentFingerprint: "git:auth" },
  { path: "src/session.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, kind: "code", textSample: "session", contentFingerprint: "git:session" },
  { path: "docs/auth.md", extension: ".md", sizeBytes: 10, isSource: false, isTest: false, kind: "documentation", textSample: "human", contentFingerprint: "git:docs" }
] });
const architecture: ArchitectureSnapshot = {
  architectureSnapshotVersion: 1, fingerprint: "architecture:abc", sourceFingerprint: "repo:abc",
  edges: [{ from: "src/session.ts", to: "src/auth.ts" }], cycles: [],
  coupling: [{ path: "src/auth.ts", incoming: 1, outgoing: 0, total: 1 }, { path: "src/session.ts", incoming: 0, outgoing: 1, total: 1 }],
  boundaryViolations: [], truncated: { files: 0, edges: 0 }
};

describe("reverse documentation drafts", () => {
  it("separates observations, inferences, unknowns, and provenance", () => {
    const draft = draftReverseDocumentation(repo(), architecture, [], [{
      id: "auth-module", title: "Authentication module", kind: "module", paths: ["src/auth.ts", "src/session.ts"],
      requestedPath: "docs/generated/auth.md"
    }])[0];
    expect(draft.destination).toEqual({ requestedPath: "docs/generated/auth.md", status: "available" });
    expect(draft.observed).toContain("Observed import edge: src/session.ts -> src/auth.ts.");
    expect(draft.inferred[0].text).toContain("does not establish architectural intent");
    expect(draft.unknown).toEqual(expect.arrayContaining([expect.stringContaining("Runtime behavior") ]));
    expect(draft.sources.files).toEqual([{ path: "src/auth.ts", contentFingerprint: "git:auth" },
      { path: "src/session.ts", contentFingerprint: "git:session" }]);
    expect(draft.markdown).toContain("## Observed");
    expect(draft.markdown).toContain("## Inferred");
    expect(draft.markdown).toContain("## Unknown");
  });

  it("never authorizes writes or overwrites an existing document", () => {
    const draft = draftReverseDocumentation(repo(), architecture, [], [{
      id: "auth-doc", title: "Auth", kind: "module", paths: ["src/auth.ts"], requestedPath: "docs/auth.md"
    }])[0];
    expect(draft).toMatchObject({ reviewRequired: true, writeAuthorized: false, overwriteAuthorized: false,
      destination: { status: "occupied-existing-file" } });
    expect(draft.diagnostics[0]).toContain("not an overwrite proposal");
    expect(draft.markdown).toContain("No write or overwrite is authorized");
  });

  it("includes authored decision text as observation rather than generated rationale", () => {
    const draft = draftReverseDocumentation(repo(), architecture, [{
      id: `decision:${"a".repeat(16)}`, path: "docs/adr/auth.md", title: "Local tokens", status: "accepted",
      decision: "Keep token parsing local.", targets: [{ kind: "file", path: "src/auth.ts", evidence: "explicit" }],
      supersedes: [], sourceFingerprint: "git:decision"
    }], [{ id: "auth", title: "Auth", kind: "module", paths: ["src/auth.ts"], requestedPath: "docs/generated.md" }])[0];
    expect(draft.observed.some((entry) => entry.includes("Authored decision"))).toBe(true);
    expect(draft.sources.decisions[0]).toMatchObject({ path: "docs/adr/auth.md", sourceFingerprint: "git:decision" });
    expect(draft.unknown).not.toContain(expect.stringContaining("rationale is unknown"));
  });

  it("requires safe existing targets with exact fingerprints and unique IDs", () => {
    expect(() => draftReverseDocumentation(repo(), architecture, [], [{
      id: "missing", title: "Missing", kind: "module", paths: ["src/nope.ts"], requestedPath: "docs/new.md"
    }])).toThrow("does not exist");
    const incomplete = repo();
    incomplete.files[0].contentFingerprint = undefined;
    expect(() => draftReverseDocumentation(incomplete, architecture, [], [{
      id: "incomplete", title: "Incomplete", kind: "module", paths: ["src/auth.ts"], requestedPath: "docs/new.md"
    }])).toThrow("lacks exact fingerprint");
    const target = { id: "same", title: "Same", kind: "module" as const, paths: ["src/auth.ts"], requestedPath: "docs/new.md" };
    expect(() => draftReverseDocumentation(repo(), architecture, [], [target, { ...target }])).toThrow("Duplicate reverse-documentation target");
    expect(() => draftReverseDocumentation(repo(), architecture, [], [{ ...target, requestedPath: "../README.md" }])).toThrow("target at index 0");
    const untouched = { ...target, paths: ["src\\auth.ts"] };
    draftReverseDocumentation(repo(), architecture, [], [untouched]);
    expect(untouched.paths).toEqual(["src\\auth.ts"]);
  });
});
