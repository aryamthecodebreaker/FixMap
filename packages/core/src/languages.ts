// What language is this repository actually written in?
//
// The question sounds trivial and the obvious answer is wrong. Asking "does any file end
// in .py" labeled clap-rs/clap — a Rust project — as Python, because it keeps a handful of
// helper scripts, and then told the reader to go look at pyproject.toml. Incidental files
// are everywhere: CI helpers, codegen scripts, a docs site inside a Go monorepo.
//
// A repository declares its language at the root, in the manifest its toolchain requires.
// That declaration is deliberate where a file extension is incidental, so it decides
// first. Only when the root is silent, or says two things at once, does the shape of the
// code get a vote.

import type { RepoFile, RepoMap } from "./types.js";
import { buildDotnetProjects, dotnetProjectForPath, referencingDotnetTestProjects, type DotnetProject } from "./dotnet-projects.js";

export type PrimaryLanguage = "node" | "python" | "go" | "rust" | "ruby" | "php" | "java" | "dotnet" | "unknown";

/** Root manifests, in the sense of "the file this toolchain requires at the top level". */
const ROOT_MANIFESTS: Readonly<Record<string, PrimaryLanguage>> = {
  "cargo.toml": "rust",
  "go.mod": "go",
  "pyproject.toml": "python",
  "setup.py": "python",
  "setup.cfg": "python",
  // A requirements-only project is still declaring Python at the root; it just predates
  // pyproject.toml. Leaving these out labeled such repositories by extension share, which
  // reads as a guess when the root was in fact explicit.
  "requirements.txt": "python",
  "pipfile": "python",
  "package.json": "node",
  "gemfile": "ruby",
  "composer.json": "php",
  "pom.xml": "java",
  "build.gradle": "java",
  "build.gradle.kts": "java"
};

const EXTENSION_LANGUAGES: Readonly<Record<string, PrimaryLanguage>> = {
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".ts": "node",
  ".tsx": "node",
  ".js": "node",
  ".jsx": "node",
  ".mjs": "node",
  ".cjs": "node",
  ".rb": "ruby",
  ".php": "php",
  ".java": "java",
  ".cs": "dotnet"
};

export type LanguageDetection = {
  language: PrimaryLanguage;
  /** Why, in a form a diagnostic can quote: a manifest name, or a share of code files. */
  evidence: string;
};

export function detectPrimaryLanguage(repo: RepoMap): LanguageDetection {
  const manifests = rootManifestLanguages(repo.files);

  if (manifests.size === 1) {
    const [language, manifest] = [...manifests][0]!;
    return { language, evidence: manifest };
  }

  // Two toolchains declare themselves at the root — a Rust crate with a docs site, say.
  // Neither manifest settles it, so the code does, restricted to the languages that
  // actually claimed the root.
  const files = repo.files;
  const shares = countCodeFiles(files);
  const candidates = manifests.size > 1 ? [...manifests.keys()] : [...shares.keys()];
  const leader = candidates
    .map((language) => ({ language, count: shares.get(language) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.language.localeCompare(b.language))[0];

  if (!leader || leader.count === 0) {
    return { language: "unknown", evidence: "no root manifest and no recognizable source files" };
  }

  const total = [...shares.values()].reduce((sum, count) => sum + count, 0);
  const share = Math.round((leader.count / total) * 100);
  const manifest = manifests.get(leader.language);
  if (manifest) {
    return { language: leader.language, evidence: `${manifest} and ${share}% of source files` };
  }

  // The root said nothing, so a nested manifest is the strongest declaration available.
  // It corroborates the extension share rather than overriding it — the leader was already
  // chosen by the code, and this only names the manifest that agrees with it.
  const nested = nearestManifest(files, leader.language);
  return {
    language: leader.language,
    evidence: nested
      ? `${nested.path} and ${share}% of source files`
      : `${share}% of source files`
  };
}

function rootManifestLanguages(files: RepoFile[]): Map<PrimaryLanguage, string> {
  const found = new Map<PrimaryLanguage, string>();

  for (const file of files) {
    if (file.path.includes("/")) {
      continue;
    }
    const language = languageForManifest(file.path.toLowerCase());
    if (language && !found.has(language)) {
      found.set(language, file.path);
    }
  }

  return found;
}

/**
 * A monorepo can declare a toolchain without declaring it at the top: `services/api/go.mod`
 * with no root manifest is an ordinary layout, and root-only detection saw nothing there.
 *
 * This stays deliberately secondary to the root. The root manifest is a statement about the
 * whole repository; a nested one is a statement about a subtree, and treating the two as
 * equal is how a Rust crate with a docs site gets called a Node project. So this is consulted
 * only when the root is silent, and the shallowest manifest wins as the closest thing to a
 * declaration about the repository as a whole.
 */
export function nearestManifest(
  files: RepoFile[],
  language: PrimaryLanguage
): { path: string; packageDir: string } | undefined {
  const candidates = files
    .filter((file) => {
      const name = file.path.split("/").pop()?.toLowerCase() ?? "";
      return languageForManifest(name) === language;
    })
    .sort((a, b) =>
      a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path)
    );

  const nearest = candidates[0];
  if (!nearest) return undefined;
  const segments = nearest.path.split("/");
  segments.pop();
  return { path: nearest.path, packageDir: segments.join("/") };
}

function countCodeFiles(files: RepoFile[]): Map<PrimaryLanguage, number> {
  const counts = new Map<PrimaryLanguage, number>();

  for (const file of files) {
    if (file.isTest) {
      continue;
    }
    const language = EXTENSION_LANGUAGES[file.extension];
    if (language) {
      counts.set(language, (counts.get(language) ?? 0) + 1);
    }
  }

  return counts;
}

/**
 * The command this project's toolchain runs its tests with, when the toolchain is
 * unambiguous about it. Go and Rust each have exactly one, which is why they can be routed
 * rather than merely suggested.
 *
 * Python is routed only when a runner is explicitly configured. A bare pyproject.toml is
 * not enough evidence: pytest, tox, unittest and nox are all plausible, so FixMap keeps the
 * actionable suggestion instead of inventing a command.
 */
export function manifestTestCommand(
  language: PrimaryLanguage,
  packageDir: string,
  files: RepoFile[] = []
): { command: string; reason: string; scopeDir?: string } | undefined {
  if (language === "go") {
    // The reason used to assert "go.mod at the repository root" unconditionally, including
    // when Go had been inferred purely from extension share and no root go.mod existed. A
    // reason that names evidence which is not there is worse than no reason.
    const manifest = nearestManifest(files, "go");
    if (!manifest) {
      return { command: "go test ./...", reason: "Go source files; no go.mod was found" };
    }
    if (manifest.packageDir) {
      // `go test ./...` at the repository root fails outright when the module lives in a
      // subdirectory — a copy-paste command that cannot run is worse than none. `-C` makes
      // it runnable as printed, exactly as Cargo's `--manifest-path` already does.
      return {
        command: `go test -C ${manifest.packageDir} ./...`,
        reason: `nearest module (${manifest.packageDir}) declared by ${manifest.path}`
      };
    }
    return { command: "go test ./...", reason: "go.mod at the repository root" };
  }
  if (language === "rust") {
    const requestedManifest = packageDir
      ? files.find((file) => file.path.toLowerCase() === `${packageDir}/cargo.toml`.toLowerCase())
      : undefined;
    const manifest = requestedManifest
      ? { path: requestedManifest.path, packageDir }
      : nearestManifest(files, "rust");
    if (!manifest) return { command: "cargo test", reason: "Rust source files; no Cargo.toml was found" };
    return manifest.packageDir
      ? { command: `cargo test --manifest-path ${manifest.path}`, reason: `nearest crate (${manifest.packageDir}) declared by ${manifest.path}` }
      : { command: "cargo test", reason: "Cargo.toml at the repository root" };
  }
  if (language === "python") {
    const config = nearestPythonTestConfig(files, packageDir);
    if (!config) return undefined;
    const directory = config.path.split("/").slice(0, -1).join("/");
    if (config.runner === "nox") {
      return {
        command: directory ? `nox -f ${config.path}` : "nox",
        reason: `${config.path} explicitly configures nox`
      };
    }
    if (config.runner === "tox") {
      return {
        command: directory ? `tox -c ${config.path}` : "tox",
        reason: `${config.path} explicitly configures tox`
      };
    }
    if (config.runner === "unittest") {
      return {
        command: directory ? `python -m unittest discover -s ${directory}` : "python -m unittest discover",
        reason: `${config.path} uses Python's unittest framework`
      };
    }
    return {
      command: directory
        ? `python -m pytest -c ${config.path} ${directory}`
        : "python -m pytest",
      reason: `${config.path} explicitly configures pytest`
    };
  }
  const manifest = nearestManifest(files, language);
  if (language === "ruby" && manifest) {
    return { command: "bundle exec rspec", reason: `${manifest.path} declares the Ruby bundle` };
  }
  if (language === "php" && manifest) {
    return { command: "composer test", reason: `${manifest.path} declares Composer scripts` };
  }
  if (language === "java") {
    const javaManifest = requestedOrNearestManifest(files, "java", packageDir);
    if (!javaManifest) return undefined;
    const directory = javaManifest.packageDir;
    if (javaManifest.path.toLowerCase().endsWith("pom.xml")) {
      const wrapper = findWrapper(files, directory, ["mvnw", "mvnw.cmd"]);
      const command = wrapper
        ? `${posixExecutable(wrapper)} test`
        : directory ? `mvn -f ${javaManifest.path} test` : "mvn test";
      const framework = javaTestFramework(files, directory);
      return {
        command,
        reason: `${javaManifest.path} declares a Maven project${wrapper ? " with a wrapper" : ""}${framework ? `; ${framework} tests detected` : ""}`
      };
    }
    const wrapper = findWrapper(files, directory, ["gradlew", "gradlew.bat"]);
    const executable = wrapper ? posixExecutable(wrapper) : "gradle";
    const command = directory ? `${executable} -p ${directory} test` : `${executable} test`;
    const framework = javaTestFramework(files, directory);
    return {
      command,
      reason: `${javaManifest.path} declares a Gradle project${wrapper ? " with a wrapper" : ""}${framework ? `; ${framework} tests detected` : ""}`
    };
  }
  if (language === "dotnet") {
    const projects = buildDotnetProjects(files);
    if (projects.length === 0) {
      return { command: "dotnet test", reason: ".NET source files; no project file was found" };
    }
    const candidates = packageDir
      ? projects.filter((project) => project.root === packageDir)
      : projects;
    return candidates.length === 1 ? dotnetCommandForProject(projects, candidates[0]!) : undefined;
  }
  return undefined;
}

/** Route a C#/F#/VB source path through its exact project and, when declared, its test project. */
export function dotnetTestCommandForPath(
  files: RepoFile[],
  sourcePath: string
): { command: string; reason: string; scopeDir?: string } | undefined {
  const projects = buildDotnetProjects(files);
  const sourceProject = dotnetProjectForPath(projects, sourcePath);
  return sourceProject ? dotnetCommandForProject(projects, sourceProject) : undefined;
}

function dotnetCommandForProject(
  projects: DotnetProject[],
  sourceProject: DotnetProject
): { command: string; reason: string; scopeDir?: string } {
  const testProject = sourceProject.test
    ? sourceProject
    : referencingDotnetTestProjects(projects, sourceProject.path)[0];
  if (testProject && testProject.path !== sourceProject.path) {
    return {
      command: `dotnet test ${testProject.path}`,
      reason: `${testProject.path} is a test project that references ${sourceProject.path}`,
      scopeDir: testProject.root
    };
  }
  return {
    command: `dotnet test ${sourceProject.path}`,
    reason: `${sourceProject.path} declares the nearest .NET ${sourceProject.test ? "test " : ""}project`,
    scopeDir: sourceProject.root
  };
}

type PythonTestRunner = "pytest" | "tox" | "nox" | "unittest";

function nearestPythonTestConfig(
  files: RepoFile[],
  packageDir: string
): { path: string; runner: PythonTestRunner } | undefined {
  const candidates = files.flatMap((file) => {
    const name = file.path.split("/").pop()?.toLowerCase() ?? "";
    let runner: PythonTestRunner | undefined;
    if (name === "noxfile.py") runner = "nox";
    else if (name === "tox.ini" || (name === "pyproject.toml" && /\[tool\.tox\b/i.test(file.textSample))) runner = "tox";
    else if (name === "pytest.ini" ||
      (name === "pyproject.toml" && /\[tool\.pytest\.ini_options\]/i.test(file.textSample)) ||
      (name === "setup.cfg" && /\[(?:tool:)?pytest\]/i.test(file.textSample))) runner = "pytest";
    else if (file.isTest && /\b(?:import\s+unittest|unittest\.TestCase|from\s+unittest\s+import)\b/.test(file.textSample)) runner = "unittest";
    return runner ? [{ file, runner }] : [];
  });
  const inRequestedPackage = packageDir
    ? candidates.filter(({ file, runner }) =>
      runner === "unittest"
        ? file.path.startsWith(`${packageDir}/`)
        : file.path === `${packageDir}/${file.path.split("/").pop()}`
    )
    : [];
  const rootDeclaresPython = files.some((file) =>
    !file.path.includes("/") && languageForManifest(file.path) === "python"
  );
  const eligible = packageDir
    ? inRequestedPackage
    : rootDeclaresPython
      ? candidates.filter(({ file, runner }) => runner === "unittest" || !file.path.includes("/"))
      : candidates;
  const selected = eligible
    .sort((a, b) =>
      a.file.path.split("/").length - b.file.path.split("/").length ||
      a.file.path.localeCompare(b.file.path)
    )[0];
  return selected ? { path: selected.file.path, runner: selected.runner } : undefined;
}

function javaTestFramework(files: RepoFile[], packageDir: string): "JUnit" | "TestNG" | undefined {
  const scoped = packageDir ? files.filter((file) => file.path.startsWith(`${packageDir}/`)) : files;
  const samples = scoped
    .filter((file) => file.isTest || /(?:pom\.xml|build\.gradle(?:\.kts)?)$/i.test(file.path))
    .map((file) => file.textSample)
    .join("\n");
  if (/\b(?:org\.testng|testng)\b/i.test(samples)) return "TestNG";
  if (/\b(?:org\.junit|junit-jupiter|junit)\b/i.test(samples)) return "JUnit";
  return undefined;
}

function requestedOrNearestManifest(
  files: RepoFile[],
  language: PrimaryLanguage,
  packageDir: string
): { path: string; packageDir: string } | undefined {
  if (packageDir) {
    const requested = files
      .filter((file) => file.path.split("/").slice(0, -1).join("/") === packageDir)
      .filter((file) => languageForManifest(file.path) === language)
      .sort((a, b) => a.path.localeCompare(b.path))[0];
    if (requested) return { path: requested.path, packageDir };
  }
  return nearestManifest(files, language);
}

function findWrapper(files: RepoFile[], packageDir: string, names: string[]): string | undefined {
  const normalizedNames = new Set(names.map((name) => name.toLowerCase()));
  const paths = packageDir
    ? names.map((name) => `${packageDir}/${name}`)
    : names;
  return files.find((file) => paths.some((path) => file.path.toLowerCase() === path.toLowerCase()))?.path ??
    files.find((file) => !file.path.includes("/") && normalizedNames.has(file.path.toLowerCase()))?.path;
}

function posixExecutable(path: string): string {
  return `./${path.replace(/\.cmd$|\.bat$/i, "")}`;
}

/** The runner to name when there is nothing to route, so the warning is actionable. */
export function suggestedRunner(language: PrimaryLanguage, files: RepoFile[]): string | undefined {
  if (language === "python") {
    // Matching on the basename rather than the full path: a repository whose only manifest
    // is `svc/pyproject.toml` configures pytest exactly as much as one that keeps it at the
    // root, and the vaguer "pytest or unittest" was hedging against nothing.
    const configs = files
      .filter((file) => ["tox.ini", "pytest.ini", "pyproject.toml", "setup.cfg"].includes(file.path.split("/").pop()?.toLowerCase() ?? ""))
      .sort((a, b) =>
        a.path.split("/").length - b.path.split("/").length ||
        Number((b.path.split("/").pop()?.toLowerCase() ?? "") === "tox.ini") - Number((a.path.split("/").pop()?.toLowerCase() ?? "") === "tox.ini") ||
        a.path.localeCompare(b.path));
    const nearest = configs[0]?.path.split("/").pop()?.toLowerCase();
    if (nearest === "tox.ini") {
      return "tox";
    }
    if (nearest) {
      return "pytest";
    }
    return "pytest or unittest";
  }
  if (language === "go") {
    return "go test ./...";
  }
  if (language === "rust") {
    return "cargo test";
  }
  if (language === "ruby") return "bundle exec rspec";
  if (language === "php") return "composer test or vendor/bin/phpunit";
  if (language === "java") return "mvn test or ./gradlew test";
  if (language === "dotnet") return "dotnet test";
  return undefined;
}

function languageForManifest(path: string): PrimaryLanguage | undefined {
  const name = path.split("/").pop()?.toLowerCase() ?? path.toLowerCase();
  return ROOT_MANIFESTS[name] ?? (/\.(?:csproj|fsproj|vbproj)$/.test(name) ? "dotnet" : undefined);
}
