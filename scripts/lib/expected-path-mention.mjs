// Detects benchmark cases whose task text already names the file the fix changed.
//
// This is scored at evaluation time rather than stored in dataset.json on purpose. A
// hand-maintained flag drifts the moment a case is edited, and the flag decides which
// cohort a case is reported in — so it has to be derived from the same task text the
// ranker reads, every run.
//
// Why it matters: a task containing "Location: lib/document.js:2339", or a GitHub
// permalink to the exact fixing file, hands the answer to any ranker with an
// explicit-file-mention signal. Those cases still exercise that signal, which is a real
// feature, but they cannot be counted as evidence that FixMap locates a file it was not
// told about. They are reported as their own cohort instead.
//
// Three tiers are recorded, because they are not equally strong:
//
//   full-path    the expected path, anchored at the repository root — including inside a
//                github.com/<owner>/<repo>/blob/<ref>/<path> permalink
//   path-suffix  a multi-segment suffix of the expected path, e.g. a tsc error reporting
//                "src/query/react/buildHooks.ts" for packages/toolkit/src/.../buildHooks.ts
//   basename     the bare filename only
//
// full-path and path-suffix both identify the file well enough to count as named, and
// together form the `mentioned` cohort. A bare basename does not: "index.ts" or
// "socket.ts" is ordinary prose in an issue about sockets, so basename-only cases stay in
// the `unmentioned` cohort and are reported separately for audit.

/** Characters that can continue a path token on either side of a candidate match. */
const PATH_BOUNDARY = /[A-Za-z0-9_/-]/;

/**
 * Repository-root anchors: text that, when it immediately precedes a path, means the path
 * is measured from the repo root rather than being a longer, different path.
 * Matches GitHub blob/tree/blame/raw permalinks at the end of the preceding text.
 */
const REPO_ROOT_ANCHOR = /(?:\/(?:blob|tree|blame|raw)\/[^\s/]+\/|raw\.githubusercontent\.com\/[^\s/]+\/[^\s/]+\/[^\s/]+\/)$/;

/**
 * Classifies one benchmark case by whether its task text names an expected fixing path.
 *
 * @param {{task?: string, expected?: string[]}} benchmark
 */
export function classifyExpectedPathMention(benchmark) {
  // Windows-style separators appear in pasted stack traces; compare in one orientation.
  const task = String(benchmark?.task ?? "").replace(/\\/g, "/");
  const expected = Array.isArray(benchmark?.expected) ? benchmark.expected : [];

  const evidence = [];
  const mentionedPaths = [];
  const suffixPaths = [];
  const basenamePaths = [];

  for (const expectedPath of expected) {
    const normalized = expectedPath.replace(/\\/g, "/");
    const segments = normalized.split("/");

    const fullHit = findAnchoredPath(task, normalized);
    if (fullHit !== null) {
      mentionedPaths.push(expectedPath);
      evidence.push({ path: expectedPath, tier: "full-path", match: normalized, context: contextAround(task, fullHit) });
      continue;
    }

    // Longest multi-segment suffix first: "src/query/react/buildHooks.ts" before "react/buildHooks.ts".
    let suffixFound = null;
    for (let start = 1; start < segments.length - 1; start += 1) {
      const suffix = segments.slice(start).join("/");
      const hit = findAnchoredPath(task, suffix);
      if (hit !== null) {
        suffixFound = { suffix, hit };
        break;
      }
    }
    if (suffixFound) {
      suffixPaths.push(expectedPath);
      evidence.push({
        path: expectedPath,
        tier: "path-suffix",
        match: suffixFound.suffix,
        context: contextAround(task, suffixFound.hit)
      });
      continue;
    }

    const basename = segments[segments.length - 1];
    const baseHit = findAnchoredPath(task, basename);
    if (baseHit !== null) {
      basenamePaths.push(expectedPath);
      evidence.push({ path: expectedPath, tier: "basename", match: basename, context: contextAround(task, baseHit) });
    }
  }

  const named = mentionedPaths.length > 0 || suffixPaths.length > 0;
  return {
    // The cohort split. True when the task identifies an expected file by path.
    mentionsExpectedPath: named,
    mentionTier: mentionedPaths.length > 0 ? "full-path" : suffixPaths.length > 0 ? "path-suffix" : basenamePaths.length > 0 ? "basename" : "none",
    mentionedPaths,
    suffixPaths,
    basenamePaths,
    evidence
  };
}

/**
 * Finds `needle` in `haystack` as a repo-root-anchored path token; returns its index or null.
 *
 * The left boundary check stops `test/lib/request.js` from counting as a mention of
 * `lib/request.js` — a genuinely different file. The repo-root anchor exempts the case
 * where the `/` before the match belongs to a GitHub permalink, where the same shape means
 * the opposite thing: the path *is* measured from the repository root.
 */
function findAnchoredPath(haystack, needle) {
  if (!needle) {
    return null;
  }
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) {
      return null;
    }
    const before = index === 0 ? "" : haystack[index - 1];
    const after = haystack[index + needle.length] ?? "";
    const leftOk = !PATH_BOUNDARY.test(before) || REPO_ROOT_ANCHOR.test(haystack.slice(Math.max(0, index - 200), index));
    // A trailing "#L200" or ":2339" is a line reference, not a longer filename.
    if (leftOk && !PATH_BOUNDARY.test(after)) {
      return index;
    }
    from = index + 1;
  }
}

/** A short excerpt so a reviewer can audit each classification instead of trusting it. */
function contextAround(task, index, radius = 70) {
  const start = Math.max(0, index - radius);
  const end = Math.min(task.length, index + radius);
  return `${start > 0 ? "…" : ""}${task.slice(start, end).replace(/\s+/g, " ").trim()}${end < task.length ? "…" : ""}`;
}

/**
 * Splits scored results into reporting cohorts.
 *
 * `unmentioned` is the generalization number: cases where the ranker had to locate the
 * file rather than read it out of the task.
 *
 * @template {{ mentionsExpectedPath: boolean }} T
 * @param {T[]} results
 */
export function splitCohorts(results) {
  return {
    all: results,
    unmentioned: results.filter((result) => !result.mentionsExpectedPath),
    mentioned: results.filter((result) => result.mentionsExpectedPath)
  };
}
