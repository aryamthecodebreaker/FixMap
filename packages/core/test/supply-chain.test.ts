import { describe, expect, it } from "vitest";
import { collectEvidence } from "../src/evidence.js";
import { createSupplyChainEvidenceProvider, validateSupplyChainEvidenceBundle } from "../src/supply-chain.js";
import type { RepoMap } from "../src/types.js";

const repo: RepoMap = {
  root: "/repo", files: [], packageScripts: [], changedFiles: [], diffText: "", packageManager: "npm", diagnostics: []
};

function bundle() {
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
    findings: [
      {
        id: "scanner-advisory-1",
        kind: "vulnerability",
        severity: "high",
        confidence: "high",
        componentId: "npm-example-1",
        summary: "External scanner matched an advisory.",
        advisoryId: "EXTERNAL-1",
        fixedVersion: "1.0.1",
        sourceUrl: "https://scanner.example/advisories/1"
      },
      {
        id: "license-policy-1",
        kind: "license-policy",
        severity: "medium",
        confidence: "medium",
        componentId: "npm-example-1",
        summary: "External policy rejected the declared license.",
        licenseId: "MIT",
        policy: "restricted-license-list-v3"
      }
    ]
  };
}

describe("supply-chain evidence", () => {
  it("normalizes externally versioned scanner findings with package subjects and provenance", async () => {
    const provider = createSupplyChainEvidenceProvider(bundle());
    const collected = await collectEvidence([provider], { repo, issueText: "", diffText: "" }, {
      now: "2026-08-21T13:00:00Z"
    });

    expect(collected.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "fixmap-supply-chain:component:npm-example-1",
        subjects: [{ kind: "package", name: "example", version: "1.0.0", purl: "pkg:npm/example@1.0.0" }],
        metadata: expect.objectContaining({
          sourceTool: "external-scanner",
          sourceToolVersion: "4.2.0",
          databaseVersion: "2026-08-20",
          sourceFingerprint: `sha256:${"a".repeat(64)}`
        })
      }),
      expect.objectContaining({
        id: "fixmap-supply-chain:finding:scanner-advisory-1",
        metadata: expect.objectContaining({ severity: "high", advisoryId: "EXTERNAL-1", fixedVersion: "1.0.1" })
      })
    ]));
    expect(collected.relationships).toContainEqual(expect.objectContaining({
      from: "fixmap-supply-chain:finding:scanner-advisory-1",
      to: "fixmap-supply-chain:component:npm-example-1",
      relation: "reported-for-component"
    }));
  });

  it("sorts deterministically without reinterpreting scanner severities", () => {
    const validated = validateSupplyChainEvidenceBundle(bundle());
    expect(validated.findings.map((finding) => finding.severity)).toEqual(["high", "medium"]);
    expect(validated.generatedAt).toBe("2026-08-21T12:00:00.000Z");
  });

  it("rejects unknown components, unsafe URLs, traversal paths, and duplicate identities", () => {
    const unknown = bundle();
    unknown.findings[0]!.componentId = "missing";
    expect(() => validateSupplyChainEvidenceBundle(unknown)).toThrow("finding at index 0");

    const unsafeUrl = bundle();
    unsafeUrl.findings[0]!.sourceUrl = "http://user:secret@scanner.example/1";
    expect(() => validateSupplyChainEvidenceBundle(unsafeUrl)).toThrow("finding at index 0");

    const traversal = bundle();
    traversal.components[0]!.paths = ["../package-lock.json"];
    expect(() => validateSupplyChainEvidenceBundle(traversal)).toThrow("component at index 0");

    const duplicate = bundle();
    duplicate.components.push({ ...duplicate.components[0]! });
    expect(() => validateSupplyChainEvidenceBundle(duplicate)).toThrow("Duplicate supply-chain component id");
  });
});
