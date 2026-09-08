import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

test("reads a committed tree larger than the default child-process buffer", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixmap-benchmark-corpus-"));
  const git = (args, input) => execFileSync("git", args, { cwd: root, encoding: "utf8", input }).trim();
  try {
    git(["init", "--quiet"]);
    const blob = git(["hash-object", "-w", "--stdin"], "source\n");
    const link = git(["hash-object", "-w", "--stdin"], "target.md");
    const entries = Array.from({ length: 16_000 }, (_, index) => `100644 ${blob}\tfiles/long-source-file-name-${index}.ts\n`);
    entries.push(`100644 ${blob}\ttarget.md\n120000 ${link}\talias.md\n`);
    git(["update-index", "--index-info"], entries.join(""));
    const tree = git(["write-tree"]);
    const commit = git(["-c", "user.name=FixMap Test", "-c", "user.email=test@example.invalid", "commit-tree", tree, "-m", "fixture"]);
    git(["update-ref", "HEAD", commit]);
    const repo = { root, files: [{ path: "alias.md" }, { path: "target.md" }] };
    assert.deepEqual(normalizePinnedAliases(repo).files, [{ path: "target.md" }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
