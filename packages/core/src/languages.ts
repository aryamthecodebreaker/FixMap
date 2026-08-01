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

export type PrimaryLanguage = "node" | "python" | "go" | "rust" | "unknown";

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
  "package.json": "node"
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
  ".cjs": "node"
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
    const language = ROOT_MANIFESTS[file.path.toLowerCase()];
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
      return ROOT_MANIFESTS[name] === language;
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
 * Python is deliberately absent. pytest, tox, unittest and nox are all plausible for a
 * repository carrying a pyproject.toml, and FixMap cannot read which one it configures —
 * `.toml` and `.cfg` are outside the sampled source extensions. Guessing would produce a
 * command that fails, so Python gets a named suggestion in the no-test-route diagnostic
 * instead of a routed command that claims more than FixMap knows.
 */
export function manifestTestCommand(
  language: PrimaryLanguage,
  packageDir: string,
  files: RepoFile[] = []
): { command: string; reason: string } | undefined {
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
    return packageDir
      ? {
        command: `cargo test --manifest-path ${packageDir}/Cargo.toml`,
        reason: `nearest crate (${packageDir}) declared by Cargo.toml`
      }
      : { command: "cargo test", reason: "Cargo.toml at the repository root" };
  }
  return undefined;
}

/** The runner to name when there is nothing to route, so the warning is actionable. */
export function suggestedRunner(language: PrimaryLanguage, files: RepoFile[]): string | undefined {
  if (language === "python") {
    // Matching on the basename rather than the full path: a repository whose only manifest
    // is `svc/pyproject.toml` configures pytest exactly as much as one that keeps it at the
    // root, and the vaguer "pytest or unittest" was hedging against nothing.
    const names = new Set(
      files.map((file) => file.path.split("/").pop()?.toLowerCase() ?? "")
    );
    if (names.has("tox.ini")) {
      return "tox";
    }
    if (names.has("pytest.ini") || names.has("pyproject.toml") || names.has("setup.cfg")) {
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
  return undefined;
}
