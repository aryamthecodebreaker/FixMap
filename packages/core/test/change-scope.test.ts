import { describe, expect, it } from "vitest";
import { buildChangeScope, renderChangeScopeMarkdown } from "../src/change-scope.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function file(path: string, textSample: string, options: Partial<RepoFile> = {}): RepoFile {
  return {
    path,
    contentFingerprint: `worktree:${(path.length % 16).toString(16).repeat(64)}`,
    extension: path.includes(".") ? path.slice(path.lastIndexOf(".")) : "",
    sizeBytes: textSample.length,
    isTest: /(?:^|\/)test/.test(path),
    isSource: true,
    kind: path.endsWith(".md") ? "documentation" : path.endsWith(".json") || path === "CODEOWNERS" ? "config" : "code",
    textSample,
    textSampleComplete: true,
    ...options
  };
}

function repository(files: RepoFile[]): RepoMap {
  return {
    root: "/repo",
    files,
    packageScripts: [{ name: "test", command: "vitest run", packageDir: "" }],
    changedFiles: [],
    diffText: "",
    packageManager: "npm",
    diagnostics: []
  };
}

describe("deterministic change scope", () => {
  it("expands explicit anchors and joins only observed repository evidence", () => {
    const policy = JSON.stringify({
      architecturePolicyVersion: 1,
      requiredReviews: [{
        id: "service-review",
        paths: ["src/services/**"],
        reviewers: ["service-team"],
        reason: "Service changes need review."
      }]
    });
    const openapi = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Checkout API", version: "1" },
      paths: { "/checkout": { post: { responses: { "200": { description: "ok" } } } } }
    });
    const repo = repository([
      file("package.json", JSON.stringify({ scripts: { test: "vitest run" } })),
      file("src/routes/checkout.ts", "import { checkout } from '../services/checkout'; export { checkout };"),
      file("src/services/checkout.ts", "import { pay } from './payments'; export const checkout = pay;"),
      file("src/services/payments.ts", "export const pay = true;"),
      file("src/ui/cart.ts", "import { checkout } from '../routes/checkout'; export { checkout };"),
      file("test/checkout.test.ts", "import { checkout } from '../src/routes/checkout'; test('checkout', () => checkout);", { isTest: true }),
      file("openapi.json", openapi),
      file("other/openapi.json", "{malformed"),
      file("CODEOWNERS", "src/services/payments.ts @payments-team\n"),
      file(".fixmap/policy.json", policy),
      file(
        "docs/adr/checkout.md",
        "# Keep payment boundaries\n\n## Decision\nKeep `src/services/payments.ts` behind checkout.\n"
      ),
      file("docs/adr/unrelated.md", "# Unrelated overview without a decision\n")
    ]);

    const scope = buildChangeScope(repo, {
      workspace: "acme",
      repository: "commerce-api",
      anchors: [
        { operation: "touch", path: "src/routes/checkout.ts" },
        { operation: "touch", path: "openapi.json" }
      ],
      direction: "both",
      maxDepth: 2,
      maxNodes: 20,
      asOf: "2026-08-26T00:00:00.000Z"
    });

    expect(scope.selected.map((entry) => entry.path)).toEqual(["openapi.json", "src/routes/checkout.ts"]);
    expect(scope.affected.map((entry) => entry.path)).toEqual([
      "src/services/checkout.ts",
      "src/ui/cart.ts",
      "test/checkout.test.ts",
      "src/services/payments.ts"
    ]);
    expect(scope.affected.find((entry) => entry.path === "src/services/payments.ts")?.evidence)
      .toContainEqual(expect.objectContaining({ kind: "dependency", from: "src/services/checkout.ts" }));
    expect(scope.testRoutes[0]).toMatchObject({
      command: "npm run test",
      relatedFiles: ["test/checkout.test.ts"]
    });
    expect(scope.contracts).toContainEqual(expect.objectContaining({ kind: "openapi", path: "openapi.json" }));
    expect(scope.decisions).toContainEqual(expect.objectContaining({ path: "docs/adr/checkout.md" }));
    expect(scope.reviewers.map((entry) => entry.reviewer)).toEqual(expect.arrayContaining(["@payments-team", "service-team"]));
    expect(scope.architectureFindings).toContainEqual(expect.objectContaining({ code: "review-required", ruleId: "service-review" }));
    expect(scope.evidenceCounts).toEqual(expect.objectContaining({ declared: 2, unresolved: 0 }));
    expect(scope.repositoryIdentity).toBe("fixmap://workspace/acme/repository/commerce-api");
    expect(scope.selected[0]?.identity).toContain("/file/");
    expect(scope.diagnostics.map((entry) => entry.code)).not.toContain("scope-contract-warning");
    expect(scope.diagnostics.map((entry) => entry.code)).not.toContain("scope-decision-warning");
    const markdown = renderChangeScopeMarkdown(scope);
    expect(markdown).toContain("# FixMap Change Scope");
    expect(markdown).toContain("Observed repository items");
    expect(markdown).toContain("did not interpret the product meaning");
  });

  it("keeps future add anchors unresolved instead of inferring product semantics", () => {
    const repo = repository([file("src/checkout.ts", "export const checkout = true;")]);
    const scope = buildChangeScope(repo, {
      workspace: "acme",
      repository: "api",
      anchors: [{ operation: "add", path: "db/migrations/057_add_checkout.sql" }],
      asOf: "2026-08-26T00:00:00.000Z"
    });

    expect(scope.selected).toEqual([]);
    expect(scope.affected).toEqual([]);
    expect(scope.anchors).toEqual([{
      operation: "add",
      path: "db/migrations/057_add_checkout.sql",
      status: "unresolved",
      matchedPaths: []
    }]);
    expect(scope.evidenceCounts).toEqual({ declared: 1, observed: 0, derived: 0, unresolved: 1 });
    expect(scope.diagnostics).toContainEqual(expect.objectContaining({ code: "scope-anchor-unresolved", severity: "info" }));
  });

  it("bounds directory expansion visibly and rejects unsafe anchors", () => {
    const repo = repository([
      file("src/a.ts", "export const a = true;"),
      file("src/b.ts", "export const b = true;"),
      file("src/c.ts", "export const c = true;")
    ]);
    const bounded = buildChangeScope(repo, {
      workspace: "acme",
      repository: "api",
      anchors: [{ operation: "touch", path: "src" }],
      maxNodes: 2,
      asOf: "2026-08-26T00:00:00.000Z"
    });

    expect(bounded.selected.map((entry) => entry.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(bounded.bounded).toEqual({ truncated: true, omittedNodes: 1 });
    expect(bounded.diagnostics).toContainEqual(expect.objectContaining({ code: "scope-bounded" }));
    expect(() => buildChangeScope(repo, {
      workspace: "acme",
      repository: "api",
      anchors: [{ operation: "touch", path: "../outside" }],
      asOf: "2026-08-26T00:00:00.000Z"
    })).toThrow("Invalid change-scope path");
  });
});
