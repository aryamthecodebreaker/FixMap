import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { buildFixMapAnalysis, buildFixMapReport } from "../src/plan.js";
import { renderMarkdownReport } from "../src/report.js";
import type { EmbeddingProvider } from "../src/semantic.js";

const exec = promisify(execFile);

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
  it("excludes a FixMap report saved by an earlier invocation", async () => {
    const root = await createAuthFixture();
    await writeFile(join(root, "plan.json"), JSON.stringify({
      reportVersion: 1,
      summary: "FixMap found password reset context.",
      contextFiles: [{ rank: 1, path: "plan.json", score: 99, confidence: "high", reasons: ["password reset"] }],
      testRoutes: [], risks: [], changedFiles: [], diagnostics: []
    }));

    const analysis = await buildFixMapAnalysis({ repoRoot: root, issueText: "password reset emails fail" });

    expect(analysis.report.contextFiles.map((file) => file.path)).not.toContain("plan.json");
    expect(analysis.report.impact?.files.map((file) => file.path) ?? []).not.toContain("plan.json");
    expect(analysis.repo.files.map((file) => file.path)).not.toContain("plan.json");
    expect(analysis.report.diagnostics).toContainEqual(expect.objectContaining({
      code: "fixmap-artifact-excluded",
      paths: ["plan.json"]
    }));
  });

  it("excludes generated setup commands from analysis while preserving team-owned files at the same path", async () => {
    const root = await createAuthFixture();
    await mkdir(join(root, ".claude", "skills", "fixmap"), { recursive: true });
    const setupPath = join(root, ".claude", "skills", "fixmap", "SKILL.md");
    await writeFile(setupPath, "You are the FixMap workflow assistant for this repository.\nRun `fixmap features`.\n");

    const generated = await buildFixMapAnalysis({ repoRoot: root, issueText: "password reset FixMap workflow" });
    expect(generated.report.contextFiles.map((file) => file.path)).not.toContain(".claude/skills/fixmap/SKILL.md");
    expect(generated.repo.files.map((file) => file.path)).not.toContain(".claude/skills/fixmap/SKILL.md");

    await writeFile(setupPath, "Team-owned instructions for password reset reviews.\n");
    const owned = await buildFixMapAnalysis({ repoRoot: root, issueText: "password reset reviews" });
    expect(owned.repo.files.map((file) => file.path)).toContain(".claude/skills/fixmap/SKILL.md");
  });

  it("keeps prior FixMap and setup artifacts out of a working-tree change map", async () => {
    const root = await createAuthFixture();
    await exec("git", ["init", "--quiet"], { cwd: root });
    await exec("git", ["config", "user.email", "fixmap@example.test"], { cwd: root });
    await exec("git", ["config", "user.name", "FixMap Test"], { cwd: root });
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "--quiet", "-m", "fixture"], { cwd: root });
    await writeFile(join(root, "src", "auth", "reset-password.ts"), "export const resetPassword = false;\n");
    await writeFile(join(root, "saved-report.json"), JSON.stringify({
      reportVersion: 1,
      summary: "FixMap report",
      contextFiles: [], testRoutes: [], risks: [], changedFiles: [], diagnostics: []
    }));
    await mkdir(join(root, ".agents", "skills", "fixmap"), { recursive: true });
    await writeFile(
      join(root, ".agents", "skills", "fixmap", "SKILL.md"),
      "You are the FixMap workflow assistant for this repository.\nRun `fixmap features`.\n"
    );

    const analysis = await buildFixMapAnalysis({
      repoRoot: root,
      issueText: "reset password",
      workingTree: true,
      includeUntracked: true,
      useCache: false
    });

    expect(analysis.report.changedFiles).toEqual(["src/auth/reset-password.ts"]);
    expect(analysis.repo.changedFiles).toEqual(["src/auth/reset-password.ts"]);
    expect(analysis.report.contextFiles.map((file) => file.path)).not.toContain("saved-report.json");
    expect(analysis.report.contextFiles.map((file) => file.path)).not.toContain(".agents/skills/fixmap/SKILL.md");
  }, 15_000);

  it("returns the exact scanned repository snapshot with an analysis", async () => {
    const root = await createAuthFixture();

    const analysis = await buildFixMapAnalysis({ repoRoot: root, issueText: "password reset emails fail" });

    expect(analysis.report.contextFiles[0]?.path).toBe("src/auth/reset-password.ts");
    expect(analysis.repo.files.find((file) => file.path === "src/auth/reset-password.ts")?.textSample)
      .toContain("sendResetEmail");
  });

  it("produces a full report from a task description", async () => {
    const root = await createAuthFixture();

    const report = await buildFixMapReport({ repoRoot: root, issueText: "password reset emails fail" });

    expect(report.contextFiles[0]?.path).toBe("src/auth/reset-password.ts");
    expect(report.testRoutes[0]?.command).toBe("npm run test");
    expect(report.risks.map((risk) => risk.area)).toContain("authentication");
    expect(report.summary).toContain("context file");
  });

  it("scans .NET project references and routes the owning test project end to end", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-plan-dotnet-"));
    await mkdir(join(root, "src", "Auth"), { recursive: true });
    await mkdir(join(root, "tests", "Auth.Tests"), { recursive: true });
    await writeFile(join(root, "src", "Auth", "Auth.csproj"), "<Project />\n");
    await writeFile(
      join(root, "src", "Auth", "RefreshToken.cs"),
      "namespace Acme.Auth;\npublic class RefreshToken { public bool IsExpired() => false; }\n"
    );
    await writeFile(
      join(root, "tests", "Auth.Tests", "Auth.Tests.csproj"),
      [
        "<Project>",
        '  <ProjectReference Include="..\\..\\src\\Auth\\Auth.csproj" />',
        '  <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.0.0" />',
        "</Project>"
      ].join("\n")
    );
    await writeFile(
      join(root, "tests", "Auth.Tests", "RefreshTokenTests.cs"),
      "namespace Acme.Auth.Tests;\npublic class RefreshTokenTests {}\n"
    );

    const report = await buildFixMapReport({ repoRoot: root, issueText: "RefreshToken IsExpired returns the wrong value" });

    expect(report.contextFiles[0]?.path).toBe("src/Auth/RefreshToken.cs");
    expect(report.testRoutes[0]).toMatchObject({
      command: "dotnet test tests/Auth.Tests/Auth.Tests.csproj",
      relatedFiles: ["tests/Auth.Tests/RefreshTokenTests.cs"]
    });
  });

  it("scans Composer and PHPUnit evidence without inventing a Composer script", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-plan-php-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "tests"), { recursive: true });
    await writeFile(join(root, "composer.json"), JSON.stringify({ autoload: { "psr-4": { "Acme\\": "src/" } } }));
    await writeFile(join(root, "phpunit.xml.dist"), "<phpunit />\n");
    await writeFile(join(root, "src", "Token.php"), "<?php\nnamespace Acme;\nclass Token { public function expired() { return false; } }\n");
    await writeFile(join(root, "tests", "TokenTest.php"), "<?php\nclass TokenTest {}\n");

    const analysis = await buildFixMapAnalysis({ repoRoot: root, issueText: "Token expired returns the wrong value" });

    expect(analysis.repo.files.find((file) => file.path === "phpunit.xml.dist")).toMatchObject({
      kind: "config",
      textSample: "<phpunit />\n"
    });
    expect(analysis.report.contextFiles[0]?.path).toBe("src/Token.php");
    expect(analysis.report.testRoutes[0]).toMatchObject({
      command: "phpunit -c phpunit.xml.dist",
      relatedFiles: ["tests/TokenTest.php"]
    });
  });

  it("scans Composer Pest evidence without routing the Pest bootstrap as a test", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-plan-pest-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "tests"), { recursive: true });
    await writeFile(join(root, "composer.json"), JSON.stringify({ "require-dev": { "pestphp/pest": "^3" } }));
    await writeFile(join(root, "tests", "Pest.php"), "<?php\npest()->extend(TestCase::class);\n");
    await writeFile(join(root, "src", "Token.php"), "<?php\nclass Token { public function expired() { return false; } }\n");
    await writeFile(join(root, "tests", "TokenTest.php"), "<?php\nit('checks token', fn () => true);\n");

    const analysis = await buildFixMapAnalysis({ repoRoot: root, issueText: "Token expired returns the wrong value" });

    expect(analysis.repo.files.find((file) => file.path === "tests/Pest.php")?.kind).toBe("config");
    expect(analysis.report.testRoutes[0]).toMatchObject({
      command: "vendor/bin/pest",
      relatedFiles: ["tests/TokenTest.php"]
    });
  });

  it("scans Ruby test evidence without treating a Gemfile as RSpec evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-plan-ruby-"));
    await mkdir(join(root, "lib"), { recursive: true });
    await mkdir(join(root, "test"), { recursive: true });
    await writeFile(join(root, "Gemfile"), 'gem "minitest"\n');
    await writeFile(join(root, "Rakefile"), "Rake::TestTask.new(:test)\n");
    await writeFile(join(root, "lib", "token.rb"), "class Token\n  def expired? = false\nend\n");
    await writeFile(join(root, "test", "token_test.rb"), "class TokenTest < Minitest::Test; end\n");

    const analysis = await buildFixMapAnalysis({ repoRoot: root, issueText: "Token expired returns the wrong value" });

    expect(analysis.repo.files.find((file) => file.path === "Rakefile")).toMatchObject({
      kind: "config",
      textSample: "Rake::TestTask.new(:test)\n"
    });
    expect(analysis.report.contextFiles[0]?.path).toBe("lib/token.rb");
    expect(analysis.report.testRoutes[0]).toMatchObject({
      command: "bundle exec rake test",
      relatedFiles: ["test/token_test.rb"]
    });
  });

  it("uses an injected local embedding provider in the shared scan-to-report path", async () => {
    const root = await createAuthFixture();
    const embeddingProvider: EmbeddingProvider = {
      id: "fixture",
      version: "1",
      model: "tiny",
      artifactHash: "a".repeat(64),
      runtime: "fixture/1",
      dimensions: 2,
      normalization: "l2",
      local: true,
      async embed(texts) {
        return texts.map((text, index) =>
          index === 0 || text.startsWith("src/auth/reset-password.ts") ? [1, 0] : [0, 1]
        );
      }
    };

    const report = await buildFixMapReport({
      repoRoot: root,
      issueText: "help a person recover access",
      embeddingProvider
    });

    expect(report.contextFiles[0]?.path).toBe("src/auth/reset-password.ts");
    expect(report.retrieval?.semantic).toMatchObject({ id: "fixture", local: true });
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

  it("names matching files removed by exclusions instead of blaming repository vocabulary", async () => {
    const root = await createAuthFixture();

    const report = await buildFixMapReport({
      repoRoot: root,
      issueText: "password reset emails fail",
      exclude: ["src/auth/**"]
    });

    expect(report.contextFiles).toEqual([]);
    const diagnostic = report.diagnostics.find((entry) => entry.code === "no-context-match");
    expect(diagnostic?.message).toContain("removed by exclusion patterns");
    expect(diagnostic?.paths).toContain("src/auth/reset-password.ts");
    expect(report.diagnostics.find((entry) => entry.code === "paths-excluded")?.severity).toBe("warning");
  });

  it("does not claim an unmatched pattern removed paths matched by another pattern", async () => {
    const root = await createAuthFixture();

    const report = await buildFixMapReport({
      repoRoot: root,
      issueText: "password reset emails fail",
      exclude: ["src/auth/**", "does-not-exist/**"]
    });

    const removed = report.diagnostics.find((entry) => entry.code === "paths-excluded")?.message ?? "";
    const unmatched = report.diagnostics.find((entry) => entry.code === "exclusion-no-match")?.message ?? "";
    expect(removed).toContain("1 exclusion pattern");
    expect(removed).toContain("`src/auth/**`");
    expect(removed).not.toContain("does-not-exist");
    expect(unmatched).toContain("`does-not-exist/**`");
  });

  it("renders exclusion globs as code instead of live markdown", async () => {
    const root = await createAuthFixture();

    const report = await buildFixMapReport({
      repoRoot: root,
      issueText: "password reset emails fail",
      exclude: ["**/_x_/**"]
    });
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("`**/_x_/**`");
    expect(markdown).not.toContain("paths: **/_x_/**");
  });

  it("does not let a giant task token become a giant diagnostic", async () => {
    const root = await createAuthFixture();
    // A pasted blob with no spaces, which used to travel verbatim into the message and
    // from there into JSON reports, CI logs, and pull request comments.
    const blob = "z".repeat(30_000);

    const report = await buildFixMapReport({ repoRoot: root, issueText: `flurbulator ${blob} telemetry` });

    const diagnostic = report.diagnostics.find((entry) => entry.code === "no-context-match");
    expect(diagnostic).toBeDefined();
    expect(diagnostic!.message.length).toBeLessThan(600);
    expect(diagnostic!.message).not.toContain("z".repeat(100));
    // The terms a reader can act on survive.
    expect(diagnostic!.message).toContain("flurbulator");
  }, 15_000);

  it("does not let a giant diff spec become a giant diagnostic", async () => {
    const root = await createAuthFixture();
    const spec = `notadiff${"Y".repeat(5_000)}`;

    const report = await buildFixMapReport({ repoRoot: root, issueText: "password reset", diffSpec: spec });

    const diagnostic = report.diagnostics.find((entry) => entry.code === "diff-unavailable");
    expect(diagnostic).toBeDefined();
    expect(diagnostic!.message.length).toBeLessThan(600);
    // git echoes the failing command back, so the spec appeared twice: once interpolated
    // and once inside git's own error text.
    expect(diagnostic!.message).not.toContain("Y".repeat(200));
    expect(diagnostic!.message).toContain("notadiff");
  }, 15_000);

  it("does not report a term diagnostic when context files are found", async () => {
    const root = await createAuthFixture();

    const report = await buildFixMapReport({ repoRoot: root, issueText: "password reset emails fail" });

    expect(report.contextFiles.length).toBeGreaterThan(0);
    expect(report.diagnostics.map((entry) => entry.code)).not.toContain("no-task-terms");
    expect(report.diagnostics.map((entry) => entry.code)).not.toContain("no-context-match");
  });

  it("warns about unresolved identifiers and exposes grounding metadata", async () => {
    const root = await createAuthFixture();
    await writeFile(
      join(root, "src", "cache-state.ts"),
      "export function transitionCacheState() { return 'partial scheduler'; }\n"
    );

    const report = await buildFixMapReport({
      repoRoot: root,
      issueText:
        "experimentalHoudiniPartialPrerenderScheduler throws InvalidTransitionState near the cache state"
    });

    expect(report.diagnostics.map((entry) => entry.code)).toContain("unresolved-identifier");
    expect(report.analysis?.grounding.unresolvedIdentifiers).toEqual([
      "experimentalHoudiniPartialPrerenderScheduler",
      "InvalidTransitionState"
    ]);
    expect(report.contextFiles.every((file) => file.confidence === "low")).toBe(true);
    expect(report.analysis?.nextAction).toContain("Verify or correct");
  });

  it("labels vague, tied results as subsystem guidance", async () => {
    const root = await createAuthFixture();
    for (const name of ["network", "parser", "renderer"]) {
      await writeFile(
        join(root, "src", `${name}.ts`),
        `export function handleError() { return "${name}"; }\n`
      );
    }

    const report = await buildFixMapReport({
      repoRoot: root,
      issueText: "improve error handling"
    });

    expect(report.contextFiles).toHaveLength(3);
    expect(report.contextFiles.every((file) => file.confidence === "low")).toBe(true);
    expect(report.diagnostics.map((entry) => entry.code)).toContain("vague-task");
    expect(report.analysis?.nextAction).toContain("Add a concrete");
  });

  it("grounds a definition found by a large source file's distributed search sample", async () => {
    const root = await createAuthFixture();
    const padding = "x".repeat(64_100);
    await writeFile(
      join(root, "src", "large-module.ts"),
      `${padding}\nexport function lateIdentifier() { return true; }\n`
    );

    const report = await buildFixMapReport({
      repoRoot: root,
      issueText: "lateIdentifier returns the wrong value"
    });

    expect(report.analysis?.grounding.unresolvedIdentifiers).toEqual([]);
    expect(report.analysis?.grounding.unverifiedIdentifiers).toEqual([]);
    expect(report.analysis?.grounding.identifiers).toContainEqual({
      identifier: "lateIdentifier",
      status: "exact-definition",
      matchedFiles: ["src/large-module.ts"]
    });
    expect(report.contextFiles[0]?.path).toBe("src/large-module.ts");
    expect(report.diagnostics.map((entry) => entry.code)).not.toContain("identifier-unverified");
    expect(report.diagnostics.map((entry) => entry.code)).not.toContain("unresolved-identifier");
  });
});
