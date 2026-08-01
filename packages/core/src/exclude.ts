// Some directories are not wrong, just not the answer.
//
// FixMap's built-in penalties know about examples/, demos/ and generated output because
// those are conventions. They cannot know that a particular repository keeps a marketing
// site under apps/web whose copy deliberately contains every symptom word the product
// documents — which is precisely why dogfooding FixMap on FixMap kept surfacing demo pages
// beside real implementation (#105, #128). No penalty tuned in the ranker can settle that;
// only the repository knows.
//
// So this is opt-in and blunt: paths the caller names are not candidates at all. Nothing
// changes for anyone who does not ask, which matters because the ranker's boilerplate
// threshold is computed as a share of the candidate set — quietly removing files from that
// set would reshuffle scoring everywhere.

const COMMENT = /^\s*#/;

export type PathExcluder = {
  /** True when the path is excluded and should not be ranked. */
  excludes: (path: string) => boolean;
  /** The pattern that matched, for `--explain` to quote back. */
  reasonFor: (path: string) => string | undefined;
  patterns: string[];
};

export const NO_EXCLUSIONS: PathExcluder = {
  excludes: () => false,
  reasonFor: () => undefined,
  patterns: []
};

/**
 * Builds a matcher from gitignore-flavored patterns. Deliberately a small subset — `*`,
 * `**`, a leading `/` to anchor at the root, and a trailing `/` to mean "this directory
 * and everything under it". A bare `apps/web` matches the directory too, because that is
 * what someone typing `--exclude apps/web` means.
 */
export function buildPathExcluder(patterns: string[]): PathExcluder {
  const cleaned = [...new Set(patterns
    .map((pattern) => normalizeSeparators(pattern.trim()))
    .filter((pattern) => pattern.length > 0 && !COMMENT.test(pattern)))];

  if (cleaned.length === 0) {
    return NO_EXCLUSIONS;
  }

  const matchers = cleaned.map((pattern) => {
    const negated = pattern.startsWith("!");
    const body = negated ? pattern.slice(1) : pattern;
    return { pattern, negated, test: compile(body) };
  });
  const cache = new Map<string, string | undefined>();

  const reasonFor = (path: string): string | undefined => {
    if (cache.has(path)) {
      return cache.get(path);
    }
    let hit: string | undefined;
    for (const matcher of matchers) {
      if (matcher.test(path)) hit = matcher.negated ? undefined : matcher.pattern;
    }
    cache.set(path, hit);
    return hit;
  };

  return {
    excludes: (path: string) => reasonFor(path) !== undefined,
    reasonFor,
    patterns: cleaned
  };
}

/** Reads `.fixmapignore` from a repository root, if it has one. */
export function parseIgnoreFile(contents: string): string[] {
  return contents.split(/\r?\n/);
}

/**
 * Repository paths are always `/`-separated, so a pattern typed with `\` — which is what
 * copying a path out of Explorer or PowerShell gives you — compiled to a literal backslash
 * and silently matched nothing. Normalizing here covers `--exclude`, `.fixmapignore` and
 * the Action input at once, because all three arrive through `buildPathExcluder`.
 *
 * The cost is that `\` can no longer escape a glob metacharacter. That is the right trade:
 * this pattern subset has no escape syntax to speak of, and a Windows user typing a path
 * separator is overwhelmingly more likely than anyone escaping a literal `*` in a filename.
 */
function normalizeSeparators(pattern: string): string {
  return pattern.replace(/\\/g, "/");
}

function compile(pattern: string): (path: string) => boolean {
  const anchored = pattern.startsWith("/");
  const directoryOnly = pattern.endsWith("/");
  const body = pattern.replace(/^\//, "").replace(/\/$/, "");

  if (body.length === 0) {
    return () => false;
  }

  const source = `${anchored ? "^" : "(?:^|/)"}${globToRegExp(body)}${directoryOnly ? "/" : "(?:/|$)"}`;
  const expression = new RegExp(source);

  return (path: string) => expression.test(directoryOnly ? `${path}/` : path);
}

function globToRegExp(glob: string): string {
  let source = "";

  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index]!;
    if (character === "*") {
      if (glob[index + 1] === "*") {
        // `**` crosses directory separators; `*` does not.
        source += ".*";
        index += 1;
        if (glob[index + 1] === "/") {
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (character === "?") {
      source += "[^/]";
      continue;
    }
    source += character.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }

  return source;
}
