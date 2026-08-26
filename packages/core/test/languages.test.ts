import { describe, expect, it } from "vitest";
import { detectPrimaryLanguage, manifestTestCommand } from "../src/languages.js";
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
    ["package.json", "src/index.ts", "node"],
    ["Gemfile", "lib/app.rb", "ruby"],
    ["composer.json", "src/App.php", "php"],
    ["pom.xml", "src/App.java", "java"],
    ["App.csproj", "src/App.cs", "dotnet"]
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

  it("does not invent RSpec from a bare Gemfile", () => {
    const repo = repoOf([
      file("Gemfile", { kind: "config", textSample: 'source "https://rubygems.org"\n' }),
      file("lib/token.rb")
    ]);

    expect(buildTestRoutes(repo, ["lib/token.rb"])).toEqual([]);
    const report = buildReportFromRepo(repo, { issueText: "Token fails" });
    expect(report.diagnostics.find((entry) => entry.code === "no-test-route")?.message)
      .not.toContain("rspec");
  });

  it("scopes an evidence-backed RSpec route to the owning Ruby project", () => {
    const repo = repoOf([
      file("Gemfile", { kind: "config", textSample: 'gem "minitest"\n' }),
      file("services/api/Gemfile", { kind: "config", textSample: 'gem "rspec-rails"\n' }),
      file("services/api/lib/token.rb"),
      file("services/api/spec/token_spec.rb", { isTest: true })
    ]);

    expect(buildTestRoutes(repo, ["services/api/lib/token.rb"])[0]).toMatchObject({
      command: "ruby -C services/api -S bundle exec rspec",
      relatedFiles: ["services/api/spec/token_spec.rb"]
    });
  });

  it("routes .NET source changes through an explicit referencing test project", () => {
    const repo = repoOf([
      file("src/Auth/Auth.csproj", { kind: "config", textSample: "<Project />" }),
      file("src/Auth/Token.cs"),
      file("tests/Auth.Tests/Auth.Tests.csproj", {
        kind: "config",
        textSample: [
          "<Project>",
          '  <ProjectReference Include="..\\..\\src\\Auth\\Auth.csproj" />',
          '  <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.0.0" />',
          "</Project>"
        ].join("\n")
      }),
      file("tests/Auth.Tests/TokenTests.cs", { isTest: true })
    ]);

    expect(buildTestRoutes(repo, ["src/Auth/Token.cs"])[0]).toEqual({
      command: "dotnet test tests/Auth.Tests/Auth.Tests.csproj",
      kind: "test",
      reason: "tests/Auth.Tests/Auth.Tests.csproj is a test project that references src/Auth/Auth.csproj",
      relatedFiles: ["tests/Auth.Tests/TokenTests.cs"]
    });
  });

  it("routes .NET to the nearest exact project when no test project is declared", () => {
    const repo = repoOf([
      file("src/Auth/Auth.csproj", { kind: "config", textSample: "<Project />" }),
      file("src/Auth/Token.cs"),
      file("src/Billing/Billing.csproj", { kind: "config", textSample: "<Project />" }),
      file("src/Billing/Invoice.cs")
    ]);

    expect(buildTestRoutes(repo, ["src/Auth/Token.cs"])[0]?.command)
      .toBe("dotnet test src/Auth/Auth.csproj");
  });

  it("does not invent a .NET project when multiple root projects own the same path", () => {
    const repo = repoOf([
      file("App.csproj", { kind: "config", textSample: "<Project />" }),
      file("Tools.csproj", { kind: "config", textSample: "<Project />" }),
      file("Program.cs")
    ]);

    expect(buildTestRoutes(repo, ["Program.cs"])).toEqual([]);
  });

  it("routes only explicitly declared Composer test scripts", () => {
    const declared = repoOf([
      file("composer.json", {
        kind: "config",
        textSample: JSON.stringify({ scripts: { test: "phpunit" } })
      }),
      file("src/App.php"),
      file("tests/AppTest.php", { isTest: true })
    ]);
    const undeclared = repoOf([
      file("composer.json", { kind: "config", textSample: "{}" }),
      file("src/App.php")
    ]);

    expect(buildTestRoutes(declared, ["src/App.php"])[0]).toMatchObject({
      command: "composer test",
      relatedFiles: ["tests/AppTest.php"]
    });
    expect(buildTestRoutes(undeclared, ["src/App.php"])).toEqual([]);
  });

  it("scopes Composer scripts and PHPUnit configs to the owning PHP project", () => {
    const composerScript = repoOf([
      file("composer.json", { kind: "config", textSample: "{}" }),
      file("services/api/composer.json", {
        kind: "config",
        textSample: JSON.stringify({ scripts: { test: ["@phpunit"] } })
      }),
      file("services/api/src/App.php"),
      file("services/api/tests/AppTest.php", { isTest: true })
    ]);
    const phpunit = repoOf([
      file("services/api/composer.json", { kind: "config", textSample: "{}" }),
      file("services/api/phpunit.xml.dist", { kind: "config", textSample: "<phpunit />" }),
      file("services/api/src/App.php"),
      file("services/api/tests/AppTest.php", { isTest: true })
    ]);

    expect(buildTestRoutes(composerScript, ["services/api/src/App.php"])[0]?.command)
      .toBe("composer --working-dir services/api test");
    expect(buildTestRoutes(phpunit, ["services/api/src/App.php"])[0]).toMatchObject({
      command: "phpunit -c services/api/phpunit.xml.dist",
      relatedFiles: ["services/api/tests/AppTest.php"]
    });
  });

  it("routes PHPUnit from an explicit require-dev dependency when no config exists", () => {
    const repo = repoOf([
      file("composer.json", {
        kind: "config",
        textSample: JSON.stringify({ "require-dev": { "phpunit/phpunit": "^11" } })
      }),
      file("src/App.php")
    ]);

    expect(buildTestRoutes(repo, ["src/App.php"])[0]?.command).toBe("vendor/bin/phpunit");
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

  it("routes pytest only when Python configuration explicitly selects it", () => {
    const repo = repoOf([
      file("pyproject.toml", {
        isSource: true,
        kind: "config",
        textSample: "[tool.pytest.ini_options]\naddopts = '-q'\n"
      }),
      file("src/app.py"),
      file("tests/test_app.py", { isTest: true })
    ]);

    expect(buildTestRoutes(repo, ["src/app.py"])[0]).toMatchObject({
      command: "python -m pytest",
      relatedFiles: ["tests/test_app.py"]
    });
  });

  it("scopes nested Python pytest and tox configurations", () => {
    const pytestRepo = repoOf([
      file("services/api/pyproject.toml", { textSample: "[tool.pytest.ini_options]\n" }),
      file("services/api/app.py")
    ]);
    const toxRepo = repoOf([
      file("services/api/pyproject.toml"),
      file("services/api/tox.ini"),
      file("services/api/app.py")
    ]);

    expect(buildTestRoutes(pytestRepo, ["services/api/app.py"])[0]?.command)
      .toBe("python -m pytest -c services/api/pyproject.toml services/api");
    expect(buildTestRoutes(toxRepo, ["services/api/app.py"])[0]?.command)
      .toBe("tox -c services/api/tox.ini");
  });

  it("routes explicit nox and stdlib unittest evidence without guessing from pyproject alone", () => {
    const nox = repoOf([
      file("pyproject.toml"),
      file("noxfile.py", { textSample: "import nox\n@nox.session\ndef tests(session): pass\n" }),
      file("src/app.py")
    ]);
    const unittest = repoOf([
      file("pyproject.toml"),
      file("src/app.py"),
      file("tests/test_app.py", {
        isTest: true,
        textSample: "import unittest\nclass AppTest(unittest.TestCase): pass\n"
      })
    ]);

    expect(buildTestRoutes(nox, ["src/app.py"])[0]?.command).toBe("nox");
    expect(buildTestRoutes(unittest, ["src/app.py"])[0]?.command).toBe("python -m unittest discover -s tests");
  });

  it("routes Maven and Gradle with wrappers and nested project scope", () => {
    const maven = repoOf([
      file("services/api/pom.xml"),
      file("services/api/mvnw", { isSource: false, kind: "config" }),
      file("services/api/src/main/java/App.java")
    ]);
    const gradle = repoOf([
      file("build.gradle"),
      file("gradlew", { isSource: false, kind: "config" }),
      file("services/payments/build.gradle.kts"),
      file("services/payments/src/main/java/Payment.java")
    ]);

    expect(buildTestRoutes(maven, ["services/api/src/main/java/App.java"])[0]?.command)
      .toBe("./services/api/mvnw test");
    expect(buildTestRoutes(gradle, ["services/payments/src/main/java/Payment.java"])[0]?.command)
      .toBe("./gradlew -p services/payments test");
  });

  it("records JUnit and TestNG evidence in Java route reasons", () => {
    const junit = repoOf([
      file("pom.xml", { textSample: "<dependency><artifactId>junit-jupiter</artifactId></dependency>" }),
      file("src/main/java/App.java"),
      file("src/test/java/AppTest.java", { isTest: true, textSample: "import org.junit.jupiter.api.Test;" })
    ]);
    const testng = repoOf([
      file("build.gradle", { textSample: "testImplementation 'org.testng:testng:7.11.0'" }),
      file("src/main/java/App.java"),
      file("src/test/java/AppTest.java", { isTest: true, textSample: "import org.testng.annotations.Test;" })
    ]);

    expect(buildTestRoutes(junit, ["src/main/java/App.java"])[0]?.reason).toContain("JUnit tests detected");
    expect(buildTestRoutes(testng, ["src/main/java/App.java"])[0]?.reason).toContain("TestNG tests detected");
  });

  it("uses installed Java tools when wrappers are absent", () => {
    expect(manifestTestCommand("java", "", [file("pom.xml")])?.command).toBe("mvn test");
    expect(manifestTestCommand("java", "svc", [file("svc/build.gradle"), file("svc/App.java")])?.command)
      .toBe("gradle -p svc test");
  });

  it("prefers tox when the repository configures it", () => {
    const repo = repoOf([
      file("pyproject.toml", { isSource: false, kind: "config" }),
      file("tox.ini", { isSource: false, kind: "config" }),
      file("src/app.py")
    ]);

    expect(buildTestRoutes(repo, ["src/app.py"])[0]?.command).toBe("tox");
  });

  it("does not let a nested tox.ini override a shallower Python configuration", () => {
    const repo = repoOf([
      file("pyproject.toml", { isSource: false, kind: "config" }),
      file("tools/legacy/tox.ini", { isSource: false, kind: "config" }),
      file("src/app.py")
    ]);

    const report = buildReportFromRepo(repo, { issueText: "app fails to start" });

    expect(report.diagnostics.find((entry) => entry.code === "no-test-route")?.message).toContain("pytest");
    expect(report.diagnostics.find((entry) => entry.code === "no-test-route")?.message).not.toContain("`tox`");
  });

  it("recomputes the Rust manifest instead of trusting a stale package directory", () => {
    const files = [
      file("Cargo.toml", { isSource: false, kind: "config" }),
      file("crates/parser/Cargo.toml", { isSource: false, kind: "config" }),
      file("crates/parser/src/lib.rs")
    ];

    expect(manifestTestCommand("rust", "crates/missing", files)).toEqual({
      command: "cargo test",
      reason: "Cargo.toml at the repository root"
    });
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

  // A monorepo can declare a toolchain in a subtree without declaring it at the top, and
  // root-only detection saw nothing there at all.
  it("names a nested manifest when the root declares nothing", () => {
    const repo = repoOf([
      file("services/api/go.mod"),
      file("services/api/reset.go"),
      file("services/api/server.go")
    ]);

    expect(detectPrimaryLanguage(repo).evidence).toBe("services/api/go.mod and 100% of source files");
  });

  // The reason asserted "go.mod at the repository root" even when no root go.mod existed,
  // naming evidence that was not there.
  it("ties the Go route reason to the manifest it actually found", () => {
    const nested = buildTestRoutes(
      repoOf([file("services/api/go.mod"), file("services/api/reset.go")]),
      ["services/api/reset.go"]
    );
    expect(nested[0]?.reason).toContain("services/api/go.mod");
    expect(nested[0]?.reason).not.toContain("repository root");

    const rooted = buildTestRoutes(repoOf([file("go.mod"), file("reset.go")]), ["reset.go"]);
    expect(rooted[0]?.reason).toBe("go.mod at the repository root");
  });

  it("recognizes a requirements-only project as declaring Python", () => {
    const repo = repoOf([file("requirements.txt"), file("app.py")]);

    expect(detectPrimaryLanguage(repo)).toEqual({ language: "python", evidence: "requirements.txt" });
  });

  // A nested pyproject.toml configures pytest exactly as much as a root one does.
  it("suggests pytest for a nested-only Python manifest", () => {
    const repo = repoOf([
      file("svc/pyproject.toml"),
      file("svc/app.py", { textSample: "def password_reset(user):\n    return user\n" })
    ]);
    const report = buildReportFromRepo(repo, { issueText: "password_reset fails" });
    const diagnostic = report.diagnostics.find((entry) => entry.code === "no-test-route");

    expect(diagnostic?.message).toContain("`pytest`");
    expect(diagnostic?.message).not.toContain("pytest or unittest");
  });
});
