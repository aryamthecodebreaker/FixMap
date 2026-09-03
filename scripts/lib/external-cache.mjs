import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export async function materializePinnedRepository(
  benchmark,
  options = {}
) {
  const cacheRoot = options.cacheRoot ?? join(tmpdir(), "fixmap-external");
  const git = options.git ?? runGit;
  const cacheName = `${benchmark.slug.replace("/", "__")}-${benchmark.sha.slice(0, 12)}`;
  const target = join(cacheRoot, cacheName);

  if (await isPinnedCheckout(target, benchmark.sha, git)) {
    return target;
  }

  await rm(target, { recursive: true, force: true });
  await mkdir(cacheRoot, { recursive: true });
  const staging = await mkdtemp(join(cacheRoot, `${cacheName}.staging-`));

  try {
    git(["init", "--quiet"], staging);
    // Repository-local long-path support is harmless on POSIX and required for real .NET
    // trees on Windows. Keeping it local avoids mutating the developer's global Git config.
    git(["config", "core.longpaths", "true"], staging);
    git(["remote", "add", "origin", benchmark.repo], staging);
    git(["fetch", "--quiet", "--depth", "1", "origin", benchmark.sha], staging);
    git(["checkout", "--quiet", "--detach", "FETCH_HEAD"], staging);
    await assertPinnedCheckout(staging, benchmark.sha, git);
    try {
      await rename(staging, target);
    } catch (error) {
      if (await isPinnedCheckout(target, benchmark.sha, git)) {
        return target;
      }
      throw error;
    }
    return target;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export function runGit(args, cwd) {
  const out = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (out.status !== 0) {
    const detail = (out.stderr || out.stdout).trim().slice(0, 300);
    throw new Error(`git ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return out.stdout.trim();
}

async function isPinnedCheckout(directory, sha, git) {
  if (!(await exists(join(directory, ".git")))) {
    return false;
  }
  try {
    await assertPinnedCheckout(directory, sha, git);
    return true;
  } catch {
    return false;
  }
}

async function assertPinnedCheckout(directory, sha, git) {
  const head = git(["rev-parse", "HEAD"], directory).trim();
  if (head.toLowerCase() !== sha.toLowerCase()) {
    throw new Error(`cached checkout HEAD ${head} does not match pinned commit ${sha}`);
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
