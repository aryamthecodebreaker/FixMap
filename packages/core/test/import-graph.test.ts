import { describe, expect, it } from "vitest";
import { buildImportGraph, findImportProximity } from "../src/import-graph.js";
import type { RepoFile } from "../src/types.js";

function codeFile(path: string, textSample: string): RepoFile {
  const extension = path.slice(path.lastIndexOf("."));
  return { path, extension, sizeBytes: textSample.length, isSource: true, isTest: false, kind: "code", textSample };
}

describe("buildImportGraph", () => {
  it("resolves relative imports including compiled .js specifiers and index files", () => {
    const files = [
      codeFile("src/plan.ts", "import { rank } from \"./rank.js\";\nimport helpers from \"./helpers\";\n"),
      codeFile("src/rank.ts", "export const rank = 1;\n"),
      codeFile("src/helpers/index.ts", "export default {};\n")
    ];

    const graph = buildImportGraph(files);

    expect([...(graph.imports.get("src/plan.ts") ?? [])].sort()).toEqual(["src/helpers/index.ts", "src/rank.ts"]);
    expect([...(graph.importedBy.get("src/rank.ts") ?? [])]).toEqual(["src/plan.ts"]);
  });

  it("handles parent-directory specifiers, re-exports, and require calls", () => {
    const files = [
      codeFile("src/http/server.ts", "const auth = require(\"../auth/session\");\nexport { reset } from \"../auth/reset.js\";\n"),
      codeFile("src/auth/session.ts", "export const session = 1;\n"),
      codeFile("src/auth/reset.ts", "export const reset = 1;\n")
    ];

    const graph = buildImportGraph(files);

    expect([...(graph.imports.get("src/http/server.ts") ?? [])].sort()).toEqual(["src/auth/reset.ts", "src/auth/session.ts"]);
  });

  it("ignores bare package specifiers and specifiers escaping the repository root", () => {
    const files = [
      codeFile("src/a.ts", "import fs from \"node:fs\";\nimport lib from \"some-package\";\nimport up from \"../../outside.js\";\n")
    ];

    const graph = buildImportGraph(files);

    expect(graph.imports.get("src/a.ts")).toBeUndefined();
  });
});

describe("findImportProximity", () => {
  const files = [
    codeFile("src/seed.ts", "import { helper } from \"./helper.js\";\n"),
    codeFile("src/helper.ts", "import { deep } from \"./deep.js\";\nexport const helper = 1;\n"),
    codeFile("src/deep.ts", "export const deep = 1;\n"),
    codeFile("src/consumer.ts", "import { seed } from \"./seed.js\";\n"),
    codeFile("src/unrelated.ts", "export const nothing = 1;\n")
  ];

  it("marks direct imports and importers at distance one and transitive files at distance two", () => {
    const graph = buildImportGraph(files);
    const proximity = findImportProximity(graph, ["src/seed.ts"]);

    expect(proximity.get("src/helper.ts")).toEqual({ distance: 1, seed: "src/seed.ts", direction: "imported-by" });
    expect(proximity.get("src/consumer.ts")).toEqual({ distance: 1, seed: "src/seed.ts", direction: "imports" });
    expect(proximity.get("src/deep.ts")?.distance).toBe(2);
    expect(proximity.has("src/seed.ts")).toBe(false);
    expect(proximity.has("src/unrelated.ts")).toBe(false);
  });

  it("returns nothing without seeds", () => {
    const graph = buildImportGraph(files);

    expect(findImportProximity(graph, []).size).toBe(0);
  });
});
