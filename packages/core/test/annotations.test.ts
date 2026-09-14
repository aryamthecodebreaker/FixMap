import { describe, expect, it } from "vitest";
import {
  addAnnotation,
  annotationsForPath,
  assessAnnotations,
  createAnnotation,
  emptyAnnotationStore,
  removeAnnotation,
  validateAnnotationStore
} from "../src/annotations.js";
import type { RepoFile } from "../src/types.js";
import { buildReportFromRepo } from "../src/report.js";

const createdAt = "2026-08-21T10:00:00.000Z";

function file(path: string): RepoFile {
  return {
    path,
    extension: ".ts",
    sizeBytes: 1,
    isTest: false,
    isSource: true,
    kind: "code",
    textSample: "x"
  };
}

describe("FixMap annotations", () => {
  it.each(["service", "contract"] as const)("matches explicit %s names without substring collisions", (kind) => {
    const annotation = createAnnotation({ scope: { kind, name: "api" }, note: "API contract", createdAt });
    const store = JSON.stringify(addAnnotation(emptyAnnotationStore(), annotation));
    const repo = { root: "/repo", files: [{ ...file(".fixmap/annotations.json"), textSample: store, textSampleComplete: true, contentFingerprint: `worktree:${"a".repeat(64)}` }], packageScripts: [], changedFiles: [], diffText: "", packageManager: "npm" as const, diagnostics: [] };
    const entries = (issueText: string) => buildReportFromRepo(repo, { issueText, annotationAsOf: createdAt }).annotations?.entries ?? [];
    expect(entries("Fix rapid rendering")).toEqual([]);
    expect(entries("Fix api-client behavior")).toEqual([]);
    expect(entries("Fix the API, please")).toHaveLength(1);
  });
  it("surfaces a renamed annotation at its new relevant path without rewriting its scope", () => {
    const annotation = createAnnotation({ scope: { kind: "file", path: "src/old.ts" }, note: "Preserve customer contract", owner: "platform", createdAt });
    const store = JSON.stringify(addAnnotation(emptyAnnotationStore(), annotation));
    const report = buildReportFromRepo({ root: "/repo", files: [
      { ...file("src/new.ts"), textSample: "export function authenticate() { return true; }" },
      { ...file(".fixmap/annotations.json"), textSample: store, textSampleComplete: true, contentFingerprint: `worktree:${"a".repeat(64)}` }
    ], packageScripts: [], changedFiles: ["src/new.ts"], packageManager: "npm", diagnostics: [],
    diffText: "diff --git a/src/old.ts b/src/new.ts\nsimilarity index 100%\nrename from src/old.ts\nrename to src/new.ts\n"
    }, { issueText: "authenticate src/new.ts", annotationAsOf: createdAt });
    const entries = report.annotations?.entries ?? [];
    expect(entries).toEqual([expect.objectContaining({ status: "renamed-target", suggestedPath: "src/new.ts", annotation })]);
    expect(annotationsForPath(entries, "src/new.ts")).toHaveLength(1);
    expect(report.diagnostics.some((entry) => entry.code === "annotation-target-stale")).toBe(true);
    expect(annotation.scope).toEqual({ kind: "file", path: "src/old.ts" });
  });
  it("creates stable canonical annotations and reviewable stores", () => {
    const annotation = createAnnotation({
      scope: { kind: "file", path: "src\\auth\\token.ts" },
      note: "  Do not refactor; contract with Acme Corp.  ",
      owner: "platform-team",
      createdAt
    });
    const repeated = createAnnotation({
      scope: { kind: "file", path: "src/auth/token.ts" },
      note: "Do not refactor; contract with Acme Corp.",
      owner: "platform-team",
      createdAt
    });
    expect(repeated).toEqual(annotation);
    expect(annotation.id).toMatch(/^annotation:[a-f0-9]{16}$/);
    expect(annotation.scope).toEqual({ kind: "file", path: "src/auth/token.ts" });
    expect(addAnnotation(emptyAnnotationStore(), annotation).annotations).toEqual([annotation]);
  });

  it("rejects tampering, duplicates, traversal, and invalid expiry", () => {
    const annotation = createAnnotation({ scope: { kind: "file", path: "src/auth.ts" }, note: "Keep stable", createdAt });
    expect(() => validateAnnotationStore({ annotationStoreVersion: 1, annotations: [{ ...annotation, note: "tampered" }] }))
      .toThrow("does not match its content identity");
    const store = addAnnotation(emptyAnnotationStore(), annotation);
    expect(() => addAnnotation(store, annotation)).toThrow("already exists");
    expect(() => createAnnotation({ scope: { kind: "file", path: "../auth.ts" }, note: "No", createdAt })).toThrow("Invalid annotation file");
    expect(() => createAnnotation({
      scope: { kind: "service", name: "auth" }, note: "No", createdAt, expiresAt: "2026-08-20T00:00:00Z"
    })).toThrow("expiry must be after");
  });

  it("assesses active, expired, missing, and renamed targets", () => {
    const annotations = [
      createAnnotation({ scope: { kind: "file", path: "src/live.ts" }, note: "Live", createdAt }),
      createAnnotation({ scope: { kind: "file", path: "src/expired.ts" }, note: "Expired", createdAt, expiresAt: "2026-08-22T00:00:00Z" }),
      createAnnotation({ scope: { kind: "file", path: "src/missing.ts" }, note: "Missing", createdAt }),
      createAnnotation({ scope: { kind: "symbol", path: "src/old.ts", symbol: "Token" }, note: "Renamed", createdAt })
    ];
    const store = annotations.reduce(addAnnotation, emptyAnnotationStore());
    const assessments = assessAnnotations(store, { files: [file("src/live.ts"), file("src/new.ts")] }, {
      now: "2026-08-23T00:00:00Z",
      renames: [{ from: "src/old.ts", to: "src/new.ts" }]
    });
    expect(assessments.map((entry) => entry.status)).toEqual(["expired", "active", "missing-target", "renamed-target"]);
    expect(assessments.find((entry) => entry.status === "renamed-target")?.suggestedPath).toBe("src/new.ts");
    expect(annotationsForPath(assessments, "src/live.ts")).toHaveLength(1);
  });

  it("removes only an existing stable identity", () => {
    const annotation = createAnnotation({ scope: { kind: "contract", name: "users-v1", path: "openapi.yaml" }, note: "Keep v1", createdAt });
    const store = addAnnotation(emptyAnnotationStore(), annotation);
    expect(removeAnnotation(store, annotation.id)).toEqual(emptyAnnotationStore());
    expect(() => removeAnnotation(store, "annotation:0000000000000000")).toThrow("does not exist");
  });
});
