import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPathExcluder } from "../src/exclude.js";
import { explainFile } from "../src/explain.js";
import { buildFixMapReport, resolveExclusions } from "../src/plan.js";
import { rankContextFiles } from "../src/rank.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function file(path: string): RepoFile {
  return {
    path,
    extension: `.${path.split(".").pop() ?? "ts"}`,
    sizeBytes: 100,
    isSource: true,
    isTest: false,
    kind: "code",
    textSample: "export function sendResetEmail() { return 'password reset email'; }"
  };
}

const repo: RepoMap = {
  root: "/repo",
  packageScripts: [],
  changedFiles: [],
  diffText: "",
  packageManager: "npm",
  diagnostics: [],
  files: [
    file("src/auth/reset-password.ts"),
    // Not named page.tsx: that already carries a presentation penalty, and a fixture whose
    // file never ranked in the first place would prove nothing about excluding it.
    file("apps/web/app/reset-copy.ts"),
    file("apps/web/app/marketing-reset.ts"),
    file("docs/guide.ts")
  ]
};

describe("buildPathExcluder", () => {
  it.each([
    ["apps/web", "apps/web/app/reset-copy.ts", true],
    ["apps/web", "apps/website/reset-copy.ts", false],
    ["apps/web/", "apps/web/app/reset-copy.ts", true],
    ["docs/**", "docs/guide.ts", true],
    ["*.tsx", "apps/web/app/page.tsx", true],
    ["*.tsx", "src/auth/reset-password.ts", false],
    ["/docs", "docs/guide.ts", true],
    ["/docs", "packages/docs/guide.ts", false]
  ])("pattern %j against %j is %s", (pattern, path, expected) => {
    expect(buildPathExcluder([pattern]).excludes(path)).toBe(expected);
  });

  it("ignores blank lines and comments", () => {
    const excluder = buildPathExcluder(["", "  ", "# a comment", "apps/web"]);

    expect(excluder.patterns).toEqual(["apps/web"]);
    expect(excluder.excludes("apps/web/app/reset-copy.ts")).toBe(true);
  });

  it("names the pattern that matched, so an omission is inspectable", () => {
    expect(buildPathExcluder(["docs/**", "apps/web"]).reasonFor("apps/web/app/reset-copy.ts")).toBe("apps/web");
  });

  it("deduplicates patterns and honors ordered negation", () => {
    const excluder = buildPathExcluder(["docs/**", "docs/**", "!docs/public/**"]);
    expect(excluder.patterns).toEqual(["docs/**", "!docs/public/**"]);
    expect(excluder.excludes("docs/private/a.md")).toBe(true);
    expect(excluder.excludes("docs/public/a.md")).toBe(false);
  });

  // Repository paths are always `/`-separated, so a pattern pasted from Explorer or
  // PowerShell used to compile to a literal backslash and match nothing at all. CI runs on
  // Linux, so these assert on the pattern string directly rather than on a real path.
  it.each([
    ["src\\a.ts", "src/a.ts", true],
    ["apps\\web", "apps/web/app/reset-copy.ts", true],
    ["docs\\**", "docs/guide.ts", true],
    ["/docs\\public", "docs/public/a.md", true],
    ["!docs\\public\\**", "docs/public/a.md", false]
  ])("normalizes the Windows separator in %j against %j", (pattern, path, expected) => {
    expect(buildPathExcluder([pattern]).excludes(path)).toBe(expected);
  });

  it("collapses a backslash pattern onto its forward-slash twin", () => {
    const excluder = buildPathExcluder(["apps\\web", "apps/web"]);

    expect(excluder.patterns).toEqual(["apps/web"]);
    expect(excluder.reasonFor("apps/web/app/reset-copy.ts")).toBe("apps/web");
  });

  it("agent report #22 handles a large ignore list without an arbitrary pattern cap", () => {
    const patterns = Array.from({ length: 1_000 }, (_, index) => `generated/${index}/**`);
    const excluder = buildPathExcluder(patterns);

    expect(excluder.patterns).toHaveLength(1_000);
    expect(excluder.excludes("generated/999/result.ts")).toBe(true);
    expect(excluder.excludes("src/result.ts")).toBe(false);
  });

  it("preserves matcher invariants across generated Windows and POSIX patterns", () => {
    for (let index = 0; index < 300; index += 1) {
      const area = `area${index % 17}`;
      const leaf = `file${index}.ts`;
      const path = `${area}/nested/${leaf}`;
      const posix = `${area}/**`;
      const windows = `${area}\\**`;
      const posixExcluder = buildPathExcluder([posix]);
      const windowsExcluder = buildPathExcluder([windows]);

      expect(posixExcluder.excludes(path)).toBe(true);
      expect(windowsExcluder.excludes(path)).toBe(posixExcluder.excludes(path));
      expect(windowsExcluder.reasonFor(path)).toBe(posix);
      expect(windowsExcluder.matchedPatterns.has(posix)).toBe(true);

      const restored = buildPathExcluder([posix, `!${area}/nested/${leaf}`]);
      expect(restored.excludes(path)).toBe(false);
      expect(restored.reasonFor(path)).toBeUndefined();
      expect(restored.matchedPatterns.has(posix)).toBe(true);
      expect(restored.matchedPatterns.has(`!${area}/nested/${leaf}`)).toBe(true);
    }
  });
});

describe("exclusions in ranking", () => {
  it("drops excluded paths from the ranking", () => {
    const before = rankContextFiles(repo, { issueText: "password reset email fails" });
    const after = rankContextFiles(repo, {
      issueText: "password reset email fails",
      exclude: buildPathExcluder(["apps/web"])
    });

    expect(before.some((entry) => entry.path.startsWith("apps/web/"))).toBe(true);
    expect(after.some((entry) => entry.path.startsWith("apps/web/"))).toBe(false);
    expect(after.some((entry) => entry.path === "src/auth/reset-password.ts")).toBe(true);
  });

  it("changes nothing when no pattern is given", () => {
    expect(rankContextFiles(repo, { issueText: "password reset email fails" }))
      .toEqual(rankContextFiles(repo, { issueText: "password reset email fails", exclude: undefined }));
  });

  it("explains an excluded file as excluded, not as scoring too low", () => {
    // Reporting "below cutoff" for a deliberate omission would be a false answer to the
    // exact question --explain exists to answer.
    const explanation = explainFile(
      repo,
      { issueText: "password reset email fails", exclude: buildPathExcluder(["apps/web"]) },
      "apps/web/app/reset-copy.ts"
    );

    expect(explanation.status).toBe("excluded");
    expect(explanation.summary).toContain("apps/web");
  });
});

describe(".fixmapignore", () => {
  it("combines the repository's ignore file with command-line patterns", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-ignore-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "apps", "web"), { recursive: true });
    await writeFile(join(root, ".fixmapignore"), "# demo pages\napps/web\n");
    await writeFile(join(root, "src", "reset.ts"), "export function sendResetEmail() { return 1; }\n");
    await writeFile(join(root, "apps", "web", "page.ts"), "export const copy = 'password reset email';\n");

    const excluder = await resolveExclusions(root, ["docs/**"]);

    // A repository that ships an ignore file has said something durable; a flag refines it.
    expect(excluder.patterns).toEqual(["apps/web", "docs/**"]);

    const report = await buildFixMapReport({ repoRoot: root, issueText: "sendResetEmail fails" });
    expect(report.contextFiles.some((entry) => entry.path.startsWith("apps/web/"))).toBe(false);
    expect(report.diagnostics.some((entry) => entry.code === "paths-excluded")).toBe(true);
  });

  it("stays silent when the repository has no ignore file", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-noignore-"));
    await writeFile(join(root, "reset.ts"), "export function sendResetEmail() { return 1; }\n");

    const report = await buildFixMapReport({ repoRoot: root, issueText: "sendResetEmail fails" });

    expect(report.diagnostics.some((entry) => entry.code === "paths-excluded")).toBe(false);
  });

  it("warns when an exclusion pattern matches no scanned path", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-nomatch-ignore-"));
    await writeFile(join(root, "reset.ts"), "export function sendResetEmail() { return 1; }\n");
    const report = await buildFixMapReport({ repoRoot: root, issueText: "sendResetEmail fails", exclude: ["missing/**"] });
    expect(report.diagnostics.some((entry) => entry.code === "paths-excluded")).toBe(false);
    expect(report.diagnostics.find((entry) => entry.code === "exclusion-no-match")?.message)
      .toContain("missing/**");
  });

  it("normalizes an absolute pattern inside the repository to a root-relative pattern", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-absolute-ignore-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "reset.ts"), "export function sendResetEmail() { return 1; }\n");

    const excluder = await resolveExclusions(root, [join(root, "src", "**")]);

    expect(excluder.patterns).toEqual(["/src/**"]);
    expect(excluder.excludes("src/reset.ts")).toBe(true);
  });
});

describe("context file limit", () => {
  it("caps the reported files without changing what leads", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-limit-"));
    for (let index = 0; index < 12; index += 1) {
      await writeFile(
        join(root, `reset-${index}.ts`),
        `export function sendResetEmail${index}() { return 'password reset email fails'; }\n`
      );
    }

    const full = await buildFixMapReport({ repoRoot: root, issueText: "password reset email fails" });
    const capped = await buildFixMapReport({ repoRoot: root, issueText: "password reset email fails", limit: 3 });

    expect(full.contextFiles.length).toBeGreaterThan(3);
    expect(capped.contextFiles).toHaveLength(3);
    expect(capped.contextFiles[0]?.path).toBe(full.contextFiles[0]?.path);
  });
});
