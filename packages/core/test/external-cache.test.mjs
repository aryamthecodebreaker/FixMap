import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { materializePinnedRepository, runGit } from "../../../scripts/lib/external-cache.mjs";

describe("external evaluation cache", () => {
  it("replaces a partial cache and verifies the exact pinned commit", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-external-test-"));
    try {
      const upstream = join(root, "upstream");
      const cacheRoot = join(root, "cache");
      await mkdir(upstream);
      runGit(["init", "--quiet"], upstream);
      runGit(["config", "user.email", "test@example.com"], upstream);
      runGit(["config", "user.name", "FixMap Test"], upstream);
      await writeFile(join(upstream, "README.md"), "first\n");
      runGit(["add", "README.md"], upstream);
      runGit(["commit", "--quiet", "-m", "fixture"], upstream);
      const sha = runGit(["rev-parse", "HEAD"], upstream);

      const partial = join(cacheRoot, `owner__repo-${sha.slice(0, 12)}`);
      await mkdir(join(partial, ".git"), { recursive: true });
      await writeFile(join(partial, "partial.txt"), "incomplete");

      const materialized = await materializePinnedRepository({
        slug: "owner/repo",
        repo: upstream,
        sha
      }, { cacheRoot });

      expect(runGit(["rev-parse", "HEAD"], materialized)).toBe(sha);
      expect(await readdir(materialized)).toContain("README.md");
      expect(await readdir(materialized)).not.toContain("partial.txt");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  it("never promotes a failed fetch into the reusable cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-external-test-"));
    try {
      const cacheRoot = join(root, "cache");
      await expect(materializePinnedRepository({
        slug: "owner/missing",
        repo: join(root, "does-not-exist"),
        sha: "0".repeat(40)
      }, { cacheRoot })).rejects.toThrow("git fetch");

      expect(await readdir(cacheRoot)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);
});
