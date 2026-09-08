import { posix } from "node:path";
import { execFileSync } from "node:child_process";

function readGit(args, cwd) {
  // Large pinned repositories exceed Node's default 1 MiB process-output limit.
  // Preserve raw target bytes, including whitespace in valid symlink names.
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

// Windows Git may materialize a symlink as its target-name text. Linux's scanner
// deduplicates the real link against its target. Give every benchmark arm that
// same corpus, using committed link identities rather than host link support.
export function normalizePinnedAliases(repo, git = readGit) {
  const aliases = new Map();
  for (const entry of git(["ls-tree", "-r", "-z", "HEAD"], repo.root).split("\0")) {
    const match = /^120000 blob ([0-9a-f]+)\t([\s\S]+)$/.exec(entry);
    if (!match) continue;
    const target = git(["cat-file", "blob", match[1]], repo.root);
    if (posix.isAbsolute(target) || target.includes("\\")) continue;
    const resolved = posix.normalize(posix.join(posix.dirname(match[2]), target));
    if (resolved === ".." || resolved.startsWith("../")) continue;
    aliases.set(match[2], resolved);
  }
  const paths = new Set(repo.files.map((file) => file.path));
  return {
    ...repo,
    files: repo.files.filter((file) => {
      const seen = new Set([file.path]);
      let target = aliases.get(file.path);
      while (target !== undefined && !seen.has(target)) {
        seen.add(target);
        if (!aliases.has(target)) return !paths.has(target);
        target = aliases.get(target);
      }
      return true;
    })
  };
}
