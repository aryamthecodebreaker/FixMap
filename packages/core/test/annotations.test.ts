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
