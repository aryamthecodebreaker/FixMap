import assert from "node:assert/strict";
import test from "node:test";
import { normalizePinnedAliases } from "./benchmark-corpus.mjs";

function fixture(paths, links) {
  const repo = { root: "/repo", files: paths.map((path) => ({ path })), diagnostics: [] };
  const targets = Object.values(links);
  const git = (args) => args[0] === "ls-tree"
    ? Object.keys(links).map((path, index) => `120000 blob ${index.toString(16)}\t${path}\0`).join("")
    : targets[parseInt(args[2], 16)];
  return { repo, git };
}

test("real links and Windows link placeholders produce the same shared corpus", () => {
  const links = { "README.md": "packages/zod/README.md" };
  const windows = fixture(["README.md", "packages/zod/README.md", "src/index.ts"], links);
  const linux = fixture(["packages/zod/README.md", "src/index.ts"], links);
  assert.deepEqual(normalizePinnedAliases(windows.repo, windows.git), normalizePinnedAliases(linux.repo, linux.git));
  assert.equal(windows.repo.files.length, 3);
});

test("relative chains deduplicate only against an available canonical target", () => {
  const { repo, git } = fixture(["docs/a.md", "docs/b.md", "real.md", "missing.md", "outside.md", "cycle.md"], {
    "docs/a.md": "b.md", "docs/b.md": "../real.md", "missing.md": "absent.md",
    "outside.md": "../outside.md", "cycle.md": "cycle.md"
  });
  assert.deepEqual(normalizePinnedAliases(repo, git).files.map((file) => file.path),
    ["real.md", "missing.md", "outside.md", "cycle.md"]);
});
