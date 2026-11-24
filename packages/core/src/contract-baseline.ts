import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { architecturePolicyFromRepo } from "./architecture.js";
import { resolveCommit, validateRef } from "./architecture-history.js";
import { compareContractInventories, type ContractComparison } from "./contracts.js";
import { inventoryContractsAtRef, inventoryWorkingTreeContracts } from "./contracts-repository.js";
import type { RepoMap } from "./types.js";

const exec = promisify(execFile);

export type ContractBaselineInput = {
  repoRoot: string;
  diffSpec?: string | undefined;
  baseRef?: string | undefined;
  headRef?: string | undefined;
  workingTree?: boolean | undefined;
};

/**
 * The contract comparison a `.fixmap/policy.json` contract rule is checked against: the same two
 * states the diff compares, read from Git objects (and the working tree when the diff includes it).
 * Returns undefined when no rule forbids breaking changes or the input has no diff, so repositories
 * without such a rule pay nothing.
 */
export async function contractBaselineForDiff(repo: RepoMap, input: ContractBaselineInput): Promise<ContractComparison | undefined> {
  let needed = false;
  try {
    needed = architecturePolicyFromRepo(repo)?.contracts.some((rule) => rule.forbidBreaking) ?? false;
  } catch {
    // An invalid policy is already reported where it is evaluated.
    return undefined;
  }
  if (!needed) return undefined;
  const range = diffRange(input);
  if (!range) return undefined;
  const repoRoot = resolve(input.repoRoot);
  const fromRef = range.mergeBase ? await mergeBase(repoRoot, range.from, range.to ?? "HEAD") : range.from;
  const from = await inventoryContractsAtRef({ repoRoot, ref: fromRef });
  const to = range.to === undefined
    ? await inventoryWorkingTreeContracts(repo)
    : (await inventoryContractsAtRef({ repoRoot, ref: range.to })).inventory;
  return compareContractInventories(from.inventory, to);
}

/** Mirrors Git's diff-spec meaning: `a...b` from the merge base, `a..b` between refs, `a` against the working tree. */
export function diffRange(input: ContractBaselineInput): { from: string; to?: string; mergeBase: boolean } | undefined {
  if (input.workingTree) return { from: "HEAD", mergeBase: false };
  const spec = input.diffSpec?.trim() ?? (input.baseRef ? `${input.baseRef}...${input.headRef ?? "HEAD"}` : undefined);
  if (!spec) return undefined;
  const threeDot = /^(.*?)\.\.\.(.*)$/.exec(spec);
  if (threeDot) return { from: validateRef(threeDot[1] || "HEAD"), to: validateRef(threeDot[2] || "HEAD"), mergeBase: true };
  const twoDot = /^(.*?)\.\.(.*)$/.exec(spec);
  if (twoDot) return { from: validateRef(twoDot[1] || "HEAD"), to: validateRef(twoDot[2] || "HEAD"), mergeBase: false };
  return { from: validateRef(spec), mergeBase: false };
}

async function mergeBase(repoRoot: string, left: string, right: string): Promise<string> {
  // Resolve first so neither ref can be read as an option.
  const [from, to] = await Promise.all([resolveCommit(repoRoot, left), resolveCommit(repoRoot, right)]);
  const { stdout } = await exec("git", ["merge-base", from, to], { cwd: repoRoot, encoding: "utf8", windowsHide: true });
  const commit = stdout.trim();
  if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new Error(`git merge-base returned no commit for ${left}...${right}.`);
  return commit;
}
