import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFixMapReport } from "../src/plan.js";

async function createAuthFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-plan-"));
  await mkdir(join(root, "src", "auth"), { recursive: true });
  await mkdir(join(root, "test", "auth"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
  await writeFile(
    join(root, "src", "auth", "reset-password.ts"),
    "export function sendResetEmail(email: string) { return email; }\n"
  );
  await writeFile(join(root, "src", "billing.ts"), "export const invoice = 1;\n");
  await writeFile(join(root, "test", "auth", "reset-password.test.ts"), "import '../../src/auth/reset-password';\n");
  return root;
}

describe("buildFixMapReport", () => {
  it("produces a full report from a task description", async () => {
    const root = await createAuthFixture();

    const report = await buildFixMapReport({ repoRoot: root, issueText: "password reset emails fail" });

    expect(report.contextFiles[0]?.path).toBe("src/auth/reset-password.ts");
    expect(report.testRoutes[0]?.command).toBe("npm run test");
    expect(report.risks.map((risk) => risk.area)).toContain("authentication");
    expect(report.summary).toContain("context file");
  });

  it("surfaces diff diagnostics instead of hiding them", async () => {
    const root = await createAuthFixture();

    const report = await buildFixMapReport({ repoRoot: root, diffSpec: "missing...HEAD" });

    expect(report.changedFiles).toEqual([]);
    expect(report.diagnostics[0]?.code).toBe("diff-unavailable");
  });

  it("explains an empty report when the task text yields no searchable terms", async () => {
    const root = await createAuthFixture();

    const report = await buildFixMapReport({ repoRoot: root, issueText: "the and or but if" });

    expect(report.contextFiles).toEqual([]);
    const diagnostic = report.diagnostics.find((entry) => entry.code === "no-task-terms");
    expect(diagnostic?.severity).toBe("warning");
    expect(diagnostic?.message).toContain("common word");
  });

  it("explains an empty report when task terms match nothing in the repository", async () => {
    const root = await createAuthFixture();

    const report = await buildFixMapReport({ repoRoot: root, issueText: "flurbulator telemetry pipeline" });

    expect(report.contextFiles).toEqual([]);
    const diagnostic = report.diagnostics.find((entry) => entry.code === "no-context-match");
    expect(diagnostic?.severity).toBe("warning");
    expect(diagnostic?.message).toContain("flurbulator");
  });

  it("does not report a term diagnostic when context files are found", async () => {
    const root = await createAuthFixture();

    const report = await buildFixMapReport({ repoRoot: root, issueText: "password reset emails fail" });

    expect(report.contextFiles.length).toBeGreaterThan(0);
    expect(report.diagnostics.map((entry) => entry.code)).not.toContain("no-task-terms");
    expect(report.diagnostics.map((entry) => entry.code)).not.toContain("no-context-match");
  });
});
