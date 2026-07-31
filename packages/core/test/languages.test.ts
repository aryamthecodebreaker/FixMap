import { describe, expect, it } from "vitest";
import { detectPrimaryLanguage } from "../src/languages.js";
import { buildReportFromRepo, buildTestRoutes } from "../src/report.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function file(path: string, overrides: Partial<RepoFile> = {}): RepoFile {
  const extension = `.${path.split(".").pop() ?? ""}`;
  return {
    path,
    extension,
    sizeBytes: 40,
    isSource: true,
    isTest: false,
    kind: "code",
    textSample: "",
    ...overrides
  };
}

function repoOf(files: RepoFile[], overrides: Partial<RepoMap> = {}): RepoMap {
  return {
    root: "/repo",
    files,
    packageScripts: [],
    changedFiles: [],
    diffText: "",
    packageManager: "npm",
    diagnostics: [],
    ...overrides
  };
}

describe("detectPrimaryLanguage", () => {
  it("reads a Rust repository as Rust despite incidental Python helpers", () => {
    // clap-rs/clap: a Rust project that keeps a few .py helper scripts. Asking "is there
    // any .py file" called it Python and pointed the reader at pyproject.toml.
    const repo = repoOf([
      file("Cargo.toml", { isSource: false, kind: "config" }),
      file("src/parser.rs"),
      file("src/builder.rs"),
      file("scripts/release.py"),
      file("scripts/changelog.py")
    ]);

    expect(detectPrimaryLanguage(repo).language).toBe("rust");
  });

  it.each([
    ["go.mod", "main.go", "go"],
    ["Cargo.toml", "src/lib.rs", "rust"],
    ["pyproject.toml", "src/app.py", "python"],
    ["setup.py", "src/app.py", "python"],
    ["package.json", "src/index.ts", "node"]
  ])("reads %s as declaring the language", (manifest, source, expected) => {
    const repo = repoOf([file(manifest, { isSource: false, kind: "config" }), file(source)]);

    expect(detectPrimaryLanguage(repo).language).toBe(expected);
  });

  it("lets the code decide when two toolchains both claim the root", () => {
    // A Rust crate that also ships a docs site. Neither manifest settles it.
    const repo = repoOf([
      file("Cargo.toml", { isSource: false, kind: "config" }),
      file("package.json", { isSource: false, kind: "config" }),
      file("src/lib.rs"),
      file("src/parser.rs"),
      file("src/builder.rs"),
      file("www/index.js")
    ]);

    const detection = detectPrimaryLanguage(repo);
    expect(detection.language).toBe("rust");
    expect(detection.evidence).toContain("Cargo.toml");
  });

  it("falls back to file share when no root manifest exists", () => {
    const repo = repoOf([file("cmd/serve.go"), file("internal/db.go"), file("tools/gen.py")]);

    expect(detectPrimaryLanguage(repo).language).toBe("go");
  });

  it("says so rather than guessing when there is nothing to read", () => {
    expect(detectPrimaryLanguage(repoOf([])).language).toBe("unknown");
  });
});

describe("test routing beyond package scripts", () => {
  it("routes go test for a Go repository", () => {
    const repo = repoOf([
      file("go.mod", { isSource: false, kind: "config" }),
      file("command.go"),
      file("args.go")
    ]);

    expect(buildTestRoutes(repo, ["command.go"])[0]?.command).toBe("go test ./...");
  });

  it("routes cargo test for a Rust repository", () => {
    const repo = repoOf([
      file("Cargo.toml", { isSource: false, kind: "config" }),
      file("src/parser.rs")
    ]);

    expect(buildTestRoutes(repo, ["src/parser.rs"])[0]?.command).toBe("cargo test");
  });

  it("scopes a workspace cargo command to the crate being edited", () => {
    const repo = repoOf([
      file("Cargo.toml", { isSource: false, kind: "config" }),
      file("crates/parser/Cargo.toml", { isSource: false, kind: "config" }),
      file("crates/parser/src/lib.rs"),
      file("crates/render/src/lib.rs")
    ]);

    // A command that cannot reach a file should not imply it will.
    expect(buildTestRoutes(repo, ["crates/parser/src/lib.rs"])[0]?.command)
      .toBe("cargo test --manifest-path crates/parser/Cargo.toml");
  });

  it("keeps package scripts ahead of a manifest fallback", () => {
    const repo = repoOf(
      [
        file("package.json", { isSource: false, kind: "config" }),
        file("Cargo.toml", { isSource: false, kind: "config" }),
        file("src/index.ts")
      ],
      { packageScripts: [{ name: "test", command: "vitest run", packageDir: "" }] }
    );

    expect(buildTestRoutes(repo, ["src/index.ts"])[0]?.command).toBe("npm run test");
  });

  it("names the runner that fits when there is nothing to route", () => {
    const repo = repoOf([
      file("pyproject.toml", { isSource: false, kind: "config" }),
      file("src/app.py")
    ]);

    const report = buildReportFromRepo(repo, { issueText: "app fails to start" });
    const diagnostic = report.diagnostics.find((entry) => entry.code === "no-test-route");

    expect(diagnostic).toBeDefined();
    expect(diagnostic!.message).toContain("pytest");
    expect(diagnostic!.message).toContain("python");
  });

  it("prefers tox when the repository configures it", () => {
    const repo = repoOf([
      file("pyproject.toml", { isSource: false, kind: "config" }),
      file("tox.ini", { isSource: false, kind: "config" }),
      file("src/app.py")
    ]);

    const report = buildReportFromRepo(repo, { issueText: "app fails to start" });

    expect(report.diagnostics.find((entry) => entry.code === "no-test-route")?.message).toContain("tox");
  });

  it("does not call a Rust repository Python in the no-test-route warning", () => {
    // The wording bug, asserted at the level a reader would hit it. This repository has
    // no Cargo.toml-based route because no context file is ranked under a crate.
    const repo = repoOf([
      file("Cargo.toml", { isSource: false, kind: "config" }),
      file("src/parser.rs", { textSample: "pub fn parse_default_value() {}" }),
      file("scripts/release.py")
    ]);

    const report = buildReportFromRepo(repo, { issueText: "parse_default_value is ignored when env is set" });
    const diagnostic = report.diagnostics.find((entry) => entry.code === "no-test-route");

    expect(diagnostic?.message ?? "").not.toContain("Python");
    expect(diagnostic?.message ?? "").not.toContain("pyproject.toml");
  });
});
