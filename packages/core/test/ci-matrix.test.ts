import { describe, expect, it } from "vitest";
import { selectCIMatrix, type CIMatrixCandidate, type CIMatrixEvidence, type CIMatrixRequirement } from "../src/ci-matrix.js";

const fingerprint = `sha256:${"a".repeat(64)}`;
const repoEvidence: CIMatrixEvidence = {
  kind: "repository",
  sourceFingerprint: fingerprint,
  reference: ".github/workflows/ci.yml:20",
  reason: "The repository declares this environment."
};
const historyEvidence: CIMatrixEvidence = {
  kind: "history",
  sourceFingerprint: `sha256:${"b".repeat(64)}`,
  reference: "ci-run-204",
  reason: "A prior failure was observed in this cell."
};

function requirement(
  id: string,
  dimension: CIMatrixRequirement["dimension"],
  value: string,
  evidence: CIMatrixEvidence[] = [repoEvidence]
): CIMatrixRequirement {
  return { id, dimension, value, affectedPaths: ["src/auth.ts"], reason: `${dimension} ${value} is required`, evidence };
}

function candidate(
  id: string,
  dimensions: CIMatrixCandidate["dimensions"],
  requirementIds: string[]
): CIMatrixCandidate {
  return {
    id,
    command: `ci run ${id}`,
    dimensions,
    coverage: requirementIds.map((requirementId) => ({ requirementId, evidence: [historyEvidence] }))
  };
}

describe("CI matrix selection", () => {
  it("selects declared cells that cover the most still-uncovered requirements", () => {
    const requirements = [
      requirement("os-linux", "os", "ubuntu-24.04"),
      requirement("runtime-node22", "runtime", "node-22"),
      requirement("db-postgres", "database", "postgres-17"),
      requirement("browser-chromium", "browser", "chromium")
    ];
    const selection = selectCIMatrix(requirements, [
      candidate("linux-node-postgres", { os: "ubuntu-24.04", runtime: "node-22", database: "postgres-17" }, ["os-linux", "runtime-node22", "db-postgres"]),
      candidate("linux-only", { os: "ubuntu-24.04" }, ["os-linux"]),
      candidate("chromium", { browser: "chromium" }, ["browser-chromium"])
    ]);
    expect(selection.selectedCells.map((cell) => cell.id)).toEqual(["linux-node-postgres", "chromium"]);
    expect(selection.selectedCells[0].coveredRequirementIds).toEqual(["db-postgres", "os-linux", "runtime-node22"]);
    expect(selection.selectedCells[0].justification[0]).toMatchObject({
      dimension: "database",
      value: "postgres-17",
      affectedPaths: ["src/auth.ts"],
      coverageEvidence: [historyEvidence]
    });
    expect(selection).toMatchObject({ uncoveredRequirements: [], minimalityClaimed: false, selectionMethod: "deterministic-greedy-set-cover" });
    expect(selection.omittedCandidateIds).toEqual(["linux-only"]);
  });

  it("reports requirements that no declared candidate covers", () => {
    const selection = selectCIMatrix([
      requirement("deploy-preview", "deployment", "preview"),
      requirement("flag-new-auth", "feature-flag", "NEW_AUTH=1")
    ], [candidate("preview", { deployment: "preview" }, ["deploy-preview"])]);
    expect(selection.uncoveredRequirements.map((entry) => entry.id)).toEqual(["flag-new-auth"]);
    expect(selection.diagnostics[0]).toContain("1 required CI matrix cell is not covered");
  });

  it("uses deterministic IDs to resolve equal-coverage ties", () => {
    const requirements = [requirement("os-linux", "os", "linux")];
    const candidates = [candidate("z-cell", { os: "linux" }, ["os-linux"]), candidate("a-cell", { os: "linux" }, ["os-linux"])];
    expect(selectCIMatrix(requirements, candidates).selectedCells[0].id).toBe("a-cell");
  });

  it("rejects invented coverage and unjustified dimensions", () => {
    const requirements = [requirement("os-windows", "os", "windows-2025")];
    expect(() => selectCIMatrix(requirements, [candidate("linux", { os: "linux" }, ["os-windows"])]))
      .toThrow("does not set os=windows-2025");
    expect(() => selectCIMatrix(requirements, [candidate("extra", { os: "windows-2025", browser: "webkit" }, ["os-windows"])]))
      .toThrow("browser=webkit has no covered requirement");
    expect(() => selectCIMatrix(requirements, [candidate("unknown", { os: "windows-2025" }, ["missing"])]))
      .toThrow("Unknown CI matrix requirement");
  });

  it("rejects weak provenance, duplicates, absolute paths, and empty evidence", () => {
    const valid = requirement("os-linux", "os", "linux");
    expect(() => selectCIMatrix([{ ...valid, evidence: [] }], [])).toThrow("requirement at index 0");
    expect(() => selectCIMatrix([{ ...valid, evidence: [{ ...repoEvidence, sourceFingerprint: "sha256:nope" }] }], [])).toThrow("evidence");
    expect(() => selectCIMatrix([{ ...valid, affectedPaths: ["C:\\secret.ts"] }], [])).toThrow("affected path");
    expect(() => selectCIMatrix([valid, valid], [])).toThrow("Duplicate CI matrix requirement");
  });

  it("returns an empty justified matrix when there are no requirements", () => {
    expect(selectCIMatrix([], [])).toEqual({
      ciMatrixVersion: 1,
      selectedCells: [],
      uncoveredRequirements: [],
      omittedCandidateIds: [],
      selectionMethod: "deterministic-greedy-set-cover",
      minimalityClaimed: false,
      diagnostics: []
    });
  });
});
