import { posix } from "node:path";
import { runGit } from "./external-cache.mjs";

// Windows Git may materialize a symlink as its target-name text. Linux's scanner
// deduplicates the real link against its target. Give every benchmark arm that
// same corpus, using committed link identities rather than host link support.
export function normalizePinnedAliases(repo, git = runGit) {
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
