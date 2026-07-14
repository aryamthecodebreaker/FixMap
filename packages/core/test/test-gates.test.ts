import { describe, expect, it } from "vitest";
import { findGatedTestDiagnostics } from "../src/test-gates.js";
import type { RepoFile } from "../src/types.js";

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
