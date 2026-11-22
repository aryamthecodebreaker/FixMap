import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { parseTree, readBlobs, resolveCommit, validateRef, type TreeEntry } from "./architecture-history.js";
import { CONTRACT_PATH, compareContractInventories, inventoryContracts, isContractCandidate } from "./contracts.js";
import type { ContractComparison, ContractDiagnostic, ContractInventory, ContractSource } from "./contracts.js";
import type { RepoMap } from "./types.js";

const exec = promisify(execFile);
/** Contracts larger than this are reported as unread rather than partially parsed. */
const MAX_CONTRACT_BYTES = 2 * 1024 * 1024;
const MAX_TREE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const STRUCTURED_EXTENSION = /\.(?:json|ya?ml)$/i;

export type ContractInventoryAtRef = {
  requestedRef: string;
  commit: string;
  inventory: ContractInventory;
};

export type ContractRefComparison = {
  contractDiffVersion: 1;
  from: { requestedRef: string; commit: string };
  to: { requestedRef: string; commit: string };
  comparison: ContractComparison;
};

/**
 * Inventories contracts in the working tree of an already-scanned repository. Contract files
 * are read in full from disk (the scanner samples only some extensions), so GraphQL,
 * Protobuf, and SQL migrations are parsed rather than reported as empty.
 */
export async function inventoryWorkingTreeContracts(repo: RepoMap): Promise<ContractInventory> {
  const root = await realpath(resolve(repo.root));
  const sources: ContractSource[] = [];
  const diagnostics: ContractDiagnostic[] = [];
  let totalBytes = 0;
  for (const file of repo.files) {
    const byPath = CONTRACT_PATH.test(file.path);
    if (!byPath && !(STRUCTURED_EXTENSION.test(file.path) && isContractCandidate(file.path, file.textSample))) continue;
    const absolute = resolve(root, file.path);
    const inside = relative(root, absolute);
    if (!inside || inside.startsWith(`..${sep}`) || inside === "..") continue;
    let bytes: Buffer | undefined;
    try {
      const info = await lstat(absolute);
      if (info.isFile() && info.size <= MAX_CONTRACT_BYTES && totalBytes + info.size <= MAX_TOTAL_BYTES) {
        bytes = await readFile(absolute);
        totalBytes += bytes.length;
      }
    } catch {
      bytes = undefined;
    }
    const decoded = bytes ? decodeUtf8(bytes) : undefined;
    if (bytes === undefined || decoded === undefined || bytes.length > MAX_CONTRACT_BYTES) {
      diagnostics.push(unread(file.path));
      continue;
    }
    if (!byPath && !isContractCandidate(file.path, decoded)) continue;
    sources.push({ path: file.path, content: decoded, fingerprint: `worktree:${createHash("sha256").update(bytes).digest("hex")}` });
  }
  return inventoryContracts(sources, diagnostics);
}

/** Inventories contracts at one exact commit through Git objects, without checkout. */
export async function inventoryContractsAtRef(input: { repoRoot: string; ref: string }): Promise<ContractInventoryAtRef> {
  const repoRoot = resolve(input.repoRoot);
  const requestedRef = validateRef(input.ref);
  const commit = await resolveCommit(repoRoot, requestedRef);
  const { stdout } = await exec("git", ["ls-tree", "-r", "-z", "-l", "--full-tree", commit, "--"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: MAX_TREE_BYTES
  });
  const candidates = parseTree(stdout)
    .filter((entry) => entry.mode !== "120000" && entry.mode !== "160000")
    .filter((entry) => CONTRACT_PATH.test(entry.path) || STRUCTURED_EXTENSION.test(entry.path));
  const diagnostics: ContractDiagnostic[] = [];
  const readable: TreeEntry[] = [];
  let totalBytes = 0;
  for (const entry of candidates) {
    if (entry.size <= MAX_CONTRACT_BYTES && totalBytes + entry.size <= MAX_TOTAL_BYTES) {
      readable.push(entry);
      totalBytes += entry.size;
    } else if (CONTRACT_PATH.test(entry.path)) {
      diagnostics.push(unread(entry.path));
    }
  }
  const blobs = await readBlobs(repoRoot, readable);
  const sources: ContractSource[] = [];
  for (const entry of readable) {
    const byPath = CONTRACT_PATH.test(entry.path);
    const content = decodeUtf8(blobs.get(entry.oid));
    if (content === undefined) {
      if (byPath) diagnostics.push(unread(entry.path));
      continue;
    }
    if (!byPath && !isContractCandidate(entry.path, content)) continue;
    sources.push({ path: entry.path, content, fingerprint: `git:${entry.oid}` });
  }
  return { requestedRef, commit, inventory: inventoryContracts(sources, diagnostics) };
}

/** Compares contract surfaces at two exact commits. Neither ref is checked out. */
export async function compareContractRefs(input: { repoRoot: string; fromRef: string; toRef: string }): Promise<ContractRefComparison> {
  const [from, to] = await Promise.all([
    inventoryContractsAtRef({ repoRoot: input.repoRoot, ref: input.fromRef }),
    inventoryContractsAtRef({ repoRoot: input.repoRoot, ref: input.toRef })
  ]);
  return {
    contractDiffVersion: 1,
    from: { requestedRef: from.requestedRef, commit: from.commit },
    to: { requestedRef: to.requestedRef, commit: to.commit },
    comparison: compareContractInventories(from.inventory, to.inventory)
  };
}

function decodeUtf8(bytes: Buffer | undefined): string | undefined {
  if (!bytes) return undefined;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function unread(path: string): ContractDiagnostic {
  return {
    code: "contract-source-incomplete",
    severity: "warning",
    path,
    message: `${path} looks like a contract, but it is larger than ${MAX_CONTRACT_BYTES / 1024 / 1024} MB, not UTF-8 text, or unreadable, so FixMap did not parse it.`
  };
}
