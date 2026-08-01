import { describe, expect, it } from "vitest";
import { buildTestRoutes } from "../src/report.js";
import { findGatedTestDiagnostics } from "../src/test-gates.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function testFile(path: string, textSample: string): RepoFile {
  return { path, extension: ".ts", sizeBytes: textSample.length, isSource: true, isTest: true, kind: "code", textSample };
}

describe("findGatedTestDiagnostics", () => {
  it("reports env-gated test files that the root command skips", () => {
    const gated = testFile(
      "tests/postgres.integration.test.ts",
      [
        "const runPostgres = process.env.RUN_POSTGRES_INTEGRATION === '1';",
        "describe.skipIf(!runPostgres)('postgres storage', () => {});"
      ].join("\n")
    );

    const diagnostics = findGatedTestDiagnostics([gated], ["tests/postgres.integration.test.ts"]);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("gated-test-skipped");
    expect(diagnostics[0]?.severity).toBe("warning");
    expect(diagnostics[0]?.message).toContain("tests/postgres.integration.test.ts");
    expect(diagnostics[0]?.message).toContain("RUN_POSTGRES_INTEGRATION");
  });

  it("reports conditional skips without a resolvable environment variable", () => {
    const gated = testFile(
      "tests/sandbox.integration.test.ts",
      "describe.skipIf(sandboxUnavailable())('sandbox', () => {});"
    );

    const diagnostics = findGatedTestDiagnostics([gated], ["tests/sandbox.integration.test.ts"]);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("conditionally skipped");
  });

  it("ignores ungated test files and files outside the routed set", () => {
    const plain = testFile("tests/auth.test.ts", "describe('auth', () => { it('works', () => {}); });");
    const gatedButUnrouted = testFile(
      "tests/other.integration.test.ts",
      "describe.skipIf(!process.env.RUN_OTHER)('other', () => {});"
    );

    expect(findGatedTestDiagnostics([plain], ["tests/auth.test.ts"])).toEqual([]);
    expect(findGatedTestDiagnostics([gatedButUnrouted], ["tests/auth.test.ts"])).toEqual([]);
  });
});

describe("script classification and route ordering", () => {
  const script = (name: string, packageDir = "", packageName?: string) => ({
    name, command: "x", packageDir, ...(packageName ? { packageName } : {})
  });
  const repo = (packageScripts: ReturnType<typeof script>[], overrides: Partial<RepoMap> = {}): RepoMap => ({
    root: "/repo",
    files: [{ path: "src/pay.ts", extension: ".ts", sizeBytes: 20, isSource: true, isTest: false, kind: "code", textSample: "applyDiscount" }],
    packageScripts,
    changedFiles: [],
    diffText: "",
    packageManager: "npm",
    diagnostics: [],
    ...overrides
  });

  // Matching only the exact name `test` gave a package that had renamed its script a
  // no-test-route diagnostic beside the very test files it would have run.
  it("routes prefixed test scripts and prefers the bare name", () => {
    const prefixed = buildTestRoutes(repo([script("test:unit"), script("test:e2e")]), ["src/pay.ts"]);
    expect(prefixed.map((route) => route.command)).toContain("npm run test:unit");
    expect(prefixed.every((route) => route.kind === "test")).toBe(true);

    const both = buildTestRoutes(repo([script("test:unit"), script("test")]), ["src/pay.ts"]);
    expect(both[0]?.command).toBe("npm run test");
  });

  // The cap is three, so validation scripts could fill the list and leave no room for the
  // command that actually runs the tests.
  it("takes test routes before validation routes", () => {
    const routes = buildTestRoutes(
      repo([script("lint"), script("typecheck"), script("check"), script("test")]),
      ["src/pay.ts"]
    );

    expect(routes[0]).toMatchObject({ command: "npm run test", kind: "test" });
    expect(routes.slice(1).every((route) => route.kind === "validation")).toBe(true);
  });

  // `yarn --cwd` is Yarn 1 syntax that Berry removed, so the printed command simply failed.
  it("addresses a yarn workspace by its declared name", () => {
    const routes = buildTestRoutes(
      repo([script("test", "packages/api", "@app/api")], {
        packageManager: "yarn",
        files: [{ path: "packages/api/src/pay.ts", extension: ".ts", sizeBytes: 20, isSource: true, isTest: false, kind: "code", textSample: "applyDiscount" }]
      }),
      ["packages/api/src/pay.ts"]
    );

    expect(routes[0]?.command).toBe("yarn workspace @app/api run test");
  });
});
