// Directories that never hold first-party source and can be large enough to exhaust the
// scan budget on their own. These are skipped in every scan mode.
export const ALWAYS_IGNORED_DIRS = new Set([".cache", ".git", ".venv", "node_modules"]);
export const LOCKFILE_NAMES = new Set([
  "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"
]);

// Conventionally generated output. `git ls-files --exclude-standard` already drops these
// through .gitignore, so a file git still reports from one of them was committed on
// purpose — chalk keeps its first-party color detection in `source/vendor/`. Those files
// are scanned and deprioritized rather than dropped. A plain directory walk has no
// .gitignore to consult, so it still skips them outright.
export const GENERATED_DIRS = new Set([
  ".idea",
  ".netlify",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".vercel",
  ".vscode",
  "build",
  "coverage",
  "dist",
  "target",
  "vendor"
]);

/** Extensions FixMap reads as source. Shared with task-path extraction so a file cannot
 * be scannable while remaining impossible to name explicitly in an issue. */
export const SOURCE_FILE_EXTENSIONS = new Set([
  ".cjs", ".cs", ".css", ".cts", ".go", ".gradle", ".java", ".js", ".json",
  ".jsx", ".md", ".mjs", ".mts", ".php", ".py", ".rb", ".rs", ".svelte",
  ".ts", ".tsx", ".vue", ".yaml", ".yml"
]);

// Words that mark a directory as a retired copy rather than maintained source. Matched
// per word inside a path segment, so "untracked quarantine" and "src/legacy" both count
// while "archiver" and "bold" do not.
const BACKUP_SEGMENT_WORDS = new Set([
  "archive",
  "archived",
  "archives",
  "backup",
  "backups",
  "bak",
  "deprecated",
  "legacy",
  "old",
  "quarantine"
]);

// Filenames editors, patch tools, and file-sync clients leave beside the real file.
const BACKUP_FILE_PATTERNS = [
  /\.(?:bak|orig|rej|old|save|swp)$/i,
  /~$/,
  /\bconflicted copy\b/i,
  /\bconflict(?:ed)?[-_ ]copy\b/i,
  // A bare `-copy`/`_copy` is an ordinary module name (`deep-copy.ts`). Sync clients use
  // a space before "copy", or add a numbered suffix to the hyphen/underscore form.
  /(?: copy|[-_]copy\s*\(\d+\))\.[^.]+$/i,
  /\s\(\d+\)\.[^.]+$/
];

function segmentWords(segment: string): string[] {
  return segment.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function directorySegments(path: string): string[] {
  return path.split("/").slice(0, -1);
}

/** True when the path sits inside a directory that normally holds generated or vendored output. */
export function isGeneratedPath(path: string): boolean {
  return directorySegments(path).some((segment) => GENERATED_DIRS.has(segment.toLowerCase())) ||
    isRecordedEvaluationOutput(path);
}

export function isRecordedEvaluationOutput(path: string): boolean {
  return /^benchmarks\/[^/]+\/(?:results|savings-results)\.json$/i.test(path);
}

// Conventional source roots. Stripping these alongside the generated roots lets a build
// artifact line up with the file it was produced from: `packages/action/dist/index.mjs`
// and `packages/action/src/index.ts` both reduce to `packages/action/index`.
const SOURCE_ROOT_DIRS = new Set(["lib", "source", "src"]);

/**
 * The path reduced to the module it names, with the extension, generated roots, and source
 * roots removed. Two paths share a stem only when the whole remaining path matches, so
 * `dist/color.js` pairs with `src/color.ts` while chalk's `source/vendor/supports-color/
 * index.js` (stem `supports-color/index`) stays distinct from `source/index.js` (`index`).
 */
export function moduleStem(path: string): string {
  const segments = path.replace(/\.[^./]+$/, "").split("/");
  const rootIndex = segments.findIndex((segment) => {
    const normalized = segment.toLowerCase();
    return GENERATED_DIRS.has(normalized) || SOURCE_ROOT_DIRS.has(normalized);
  });
  // Strip exactly one layout root. Removing every `lib`, `src`, or `dist` segment made
  // `src/foo/lib/index.ts` collide with the unrelated `src/lib/foo/index.ts`.
  if (rootIndex !== -1) segments.splice(rootIndex, 1);
  return segments.join("/");
}

/** Match an explicit task path without letting a nested mention boost a root-level file
 * that merely shares its basename. A longer mention may omit the repository/package
 * prefix only when the scanned path itself still contains directory context. */
export function pathMatchesMention(path: string, mention: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/").toLowerCase();
  const normalizedMention = mention.replace(/\\/g, "/").toLowerCase();
  if (normalizedPath === normalizedMention ||
    normalizedPath.endsWith(`/${normalizedMention}`) ||
    (normalizedPath.includes("/") && normalizedMention.endsWith(`/${normalizedPath}`))) return true;
  if (!normalizedMention.includes("/") && !normalizedMention.includes(".")) {
    const fileName = normalizedPath.split("/").at(-1) ?? "";
    return fileName.replace(/\.[^.]+$/, "") === normalizedMention;
  }
  return false;
}

/** True when the path looks like a retired copy: a backup directory, or a tool-left duplicate filename. */
export function isBackupPath(path: string): boolean {
  const inBackupDirectory = directorySegments(path)
    .some((segment) => segmentWords(segment).some((word) => BACKUP_SEGMENT_WORDS.has(word)));
  if (inBackupDirectory) {
    return true;
  }

  const fileName = path.split("/").pop() ?? "";
  return BACKUP_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}
