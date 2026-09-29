import { describe, expect, it } from "vitest";
import { buildCapabilityMap, capabilityStoreFromRepo, renderCapabilityMapMarkdown, validateCapabilityStore } from "../src/capabilities.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function file(path: string, textSample: string): RepoFile {
  return {
    path,
    contentFingerprint: `worktree:${"a".repeat(64)}`,
    extension: path.slice(path.lastIndexOf(".")),
    sizeBytes: textSample.length,
    isTest: false,
    isSource: true,
    kind: path.endsWith(".json") ? "config" : "code",
    textSample,
    textSampleComplete: true
  };
}

function repo(files: RepoFile[]): RepoMap {
  return { root: "/repo", files, packageScripts: [], changedFiles: [], diffText: "", packageManager: "npm", diagnostics: [] };
}

const store = {
  capabilityStoreVersion: 1,
  workspace: "acme",
  repository: "commerce-api",
  capabilities: [{
    id: "checkout",
    name: "Checkout",
    anchors: [{ operation: "touch", path: "src/checkout.ts" }],
    traversal: { direction: "dependents", maxDepth: 3, maxNodes: 100 }
  }]
};

describe("persistent capability maps", () => {
  it("validates human-owned anchors without storing generated conclusions", () => {
    expect(validateCapabilityStore(store)).toEqual(store);
    expect(() => validateCapabilityStore({
      ...store,
      capabilities: [{ ...store.capabilities[0], discoveredFiles: ["src/guessed.ts"] }]
    })).toThrow("unknown field");
    expect(() => validateCapabilityStore({
      ...store,
      capabilities: [...store.capabilities, store.capabilities[0]]
    })).toThrow("Duplicate capability id");
    expect(() => validateCapabilityStore({
      ...store,
      capabilities: [{ ...store.capabilities[0], anchors: [{ operation: "touch", path: "../outside" }] }]
    })).toThrow("Invalid capability anchor path");
    expect(() => validateCapabilityStore({
      ...store,
      capabilities: [{
        ...store.capabilities[0],
        anchors: [
          { operation: "touch", path: "src/checkout.ts" },
          { operation: "touch", path: "src\\checkout.ts" }
        ]
      }]
    })).toThrow("duplicate touch anchor");
  });

  it("loads exact store provenance and rebuilds the current capability scope", () => {
    const repository = repo([
      file(".fixmap/capabilities.json", JSON.stringify(store)),
      file("src/checkout.ts", "export const checkout = true;"),
      file("src/cart.ts", "import { checkout } from './checkout'; export { checkout };")
    ]);

    expect(capabilityStoreFromRepo(repository)?.source).toEqual({
      path: ".fixmap/capabilities.json",
      fingerprint: `worktree:${"a".repeat(64)}`
    });
    const result = buildCapabilityMap(repository, { id: "CHECKOUT", asOf: "2026-08-26T00:00:00.000Z" });
    expect(result.capability).toEqual(store.capabilities[0]);
    expect(result.scope.selected.map((entry) => entry.path)).toEqual(["src/checkout.ts"]);
    expect(result.scope.affected.map((entry) => entry.path)).toEqual(["src/cart.ts"]);
    expect(result.scope.traversal).toEqual({ direction: "dependents", maxDepth: 3, maxNodes: 100 });
    expect(renderCapabilityMapMarkdown(result)).toContain("# FixMap Capability: Checkout");
    expect(renderCapabilityMapMarkdown(result)).toContain("Definition source: `.fixmap/capabilities.json`");
  });

  it("fails closed for missing, incomplete, malformed, or unknown capability evidence", () => {
    expect(() => buildCapabilityMap(repo([]), { id: "checkout", asOf: "2026-08-26T00:00:00.000Z" }))
      .toThrow("was not found");
    expect(() => capabilityStoreFromRepo(repo([{
      ...file(".fixmap/capabilities.json", JSON.stringify(store)),
      textSampleComplete: false,
      textSampleSkipReason: "too-large"
    }]))).toThrow("complete content");
    expect(() => capabilityStoreFromRepo(repo([file(".fixmap/capabilities.json", "{bad")]))).toThrow("not valid JSON");
    expect(() => buildCapabilityMap(repo([file(".fixmap/capabilities.json", JSON.stringify(store))]), {
      id: "search",
      asOf: "2026-08-26T00:00:00.000Z"
    })).toThrow("was not found");
  });
});
