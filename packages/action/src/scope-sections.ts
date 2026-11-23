import { basename } from "node:path";
import {
  buildCapabilityMap,
  buildChangeScope,
  capabilityStoreFromRepo,
  compareCapabilityRefs,
  scanRepo,
  type CapabilityHistoryDiff,
  type CapabilityMap,
  type ChangeScopeAnchor,
  type ChangeScopeResult,
  type RepoMap
} from "@aryam/fixmap-core";

/** Paths listed per comment section; the CLI and MCP return the complete lists. */
export const SECTION_PATH_LIMIT = 10;
const CAPABILITY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export type ScopeSectionRequest = {
  touch: string[];
  add: string[];
  capability?: string | undefined;
};

export type ScopeSectionContext = {
  repoRoot: string;
  useCache: boolean;
  asOf: string;
  /** Present only on pull requests whose base and head refs are both known. */
  diffRefs?: { baseRef: string; headRef: string };
  scanRepo?: typeof scanRepo;
  compareCapabilityRefs?: typeof compareCapabilityRefs;
};

export type ScopeSections = {
  markdown: string;
  warnings: string[];
  changeScopeAffectedCount?: number;
};

/**
 * Newlines and commas both separate paths. Repository paths with commas are rare enough that
 * matching the exclude input's familiar separators matters more than supporting them here.
 */
export function splitPathListInput(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(/[\r\n,]+/).map((entry) => entry.trim()).filter(Boolean);
}

export function parseCapabilityInput(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const id = raw.trim().toLowerCase();
  if (!CAPABILITY_ID.test(id)) {
    throw new Error("capability must be one id of at most 64 lowercase letters, numbers, dots, dashes, or underscores.");
  }
  return id;
}

export function hasScopeSections(request: ScopeSectionRequest): boolean {
  return request.touch.length > 0 || request.add.length > 0 || request.capability !== undefined;
}

/**
 * Runs the same Core engines as `fixmap change-scope` and `fixmap capability` over the checked-out
 * tree. Everything here is read-only: the capability store is parsed, never written, and the
 * base-vs-head diff reads Git objects without a checkout.
 */
export async function buildScopeSections(request: ScopeSectionRequest, context: ScopeSectionContext): Promise<ScopeSections> {
  const repo = await (context.scanRepo ?? scanRepo)({
    repoRoot: context.repoRoot,
    useCache: context.useCache,
    includeHistory: true
  });
  const scanError = repo.diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (scanError) throw new Error(scanError.message);

  const sections: string[] = [];
  const warnings: string[] = [];
  let changeScopeAffectedCount: number | undefined;

  if (request.touch.length > 0 || request.add.length > 0) {
    const anchors: ChangeScopeAnchor[] = [
      ...request.touch.map((path) => ({ operation: "touch" as const, path })),
      ...request.add.map((path) => ({ operation: "add" as const, path }))
    ];
    const scope = buildChangeScope(repo, {
      workspace: "local",
      repository: repositoryId(basename(context.repoRoot)),
      anchors,
      asOf: context.asOf
    });
    changeScopeAffectedCount = scope.affected.length;
    sections.push(renderChangeScopeSection(scope));
  }

  if (request.capability) {
    const result = await buildCapabilitySection(repo, request.capability, context);
    sections.push(result.markdown);
    warnings.push(...result.warnings);
  }

  return {
    markdown: sections.join("\n"),
    warnings,
    ...(changeScopeAffectedCount !== undefined ? { changeScopeAffectedCount } : {})
  };
}

export function renderChangeScopeSection(scope: ChangeScopeResult, heading = "## Change scope (preview)"): string {
  const unresolved = scope.anchors.filter((anchor) => anchor.status === "unresolved");
  const lines = [
    heading,
    "",
    `- Selected: ${scope.selected.length.toLocaleString()}`,
    `- Affected: ${scope.affected.length.toLocaleString()}`,
    `- Unresolved anchors: ${unresolved.length.toLocaleString()}`,
    `- Truncated: ${scope.bounded.truncated ? `yes; ${scope.bounded.omittedNodes.toLocaleString()} nodes omitted at the ${scope.traversal.maxNodes.toLocaleString()}-node bound` : "no"}`,
    ""
  ];
  if (scope.affected.length > 0) {
    lines.push("Top affected paths:", "");
    lines.push(...scope.affected.slice(0, SECTION_PATH_LIMIT).map((entry) => `- ${markdownCode(entry.path)} (distance ${entry.distance})`));
    if (scope.affected.length > SECTION_PATH_LIMIT) {
      lines.push(`- …and ${(scope.affected.length - SECTION_PATH_LIMIT).toLocaleString()} more`);
    }
    lines.push("");
  }
  if (unresolved.length > 0) {
    lines.push("Unresolved anchors:", "");
    lines.push(...unresolved.slice(0, SECTION_PATH_LIMIT).map((anchor) => `- ${anchor.operation} ${markdownCode(anchor.path)}`));
    if (unresolved.length > SECTION_PATH_LIMIT) {
      lines.push(`- …and ${(unresolved.length - SECTION_PATH_LIMIT).toLocaleString()} more`);
    }
    lines.push("");
  }
  lines.push(
    `Traversal: ${scope.traversal.direction}, depth ${scope.traversal.maxDepth}. ` +
      "Expanded from explicit anchors over repository import edges only; run `fixmap change-scope` for the complete evidence.",
    ""
  );
  return lines.join("\n");
}

async function buildCapabilitySection(
  repo: RepoMap,
  id: string,
  context: ScopeSectionContext
): Promise<{ markdown: string; warnings: string[] }> {
  const heading = `## Capability (preview): ${markdownCode(id)}`;
  // A broken or missing store must not hide the plan report above it, so it degrades to a notice.
  let storePresent: boolean;
  try {
    storePresent = capabilityStoreFromRepo(repo) !== undefined;
  } catch (error) {
    const detail = message(error);
    return {
      markdown: [heading, "", `Capability map unavailable: ${detail}`, ""].join("\n"),
      warnings: [`FixMap could not read the capability store: ${detail}`]
    };
  }
  if (!storePresent) {
    const detail = ".fixmap/capabilities.json was not found in this checkout; create one with `fixmap capability create`.";
    return {
      markdown: [heading, "", `Capability map unavailable: ${detail}`, ""].join("\n"),
      warnings: [`FixMap capability ${id}: ${detail}`]
    };
  }

  const lines = [heading, ""];
  const warnings: string[] = [];
  let map: CapabilityMap | undefined;
  try {
    map = buildCapabilityMap(repo, { id, asOf: context.asOf });
  } catch (error) {
    const detail = message(error);
    lines.push(`Capability map unavailable: ${detail}`, "");
    warnings.push(`FixMap capability ${id}: ${detail}`);
  }
  if (map) {
    lines.push(
      `**${escapeMarkdown(map.capability.name)}**, defined in ${markdownCode(map.source.path)} (${map.source.fingerprint}).`,
      "",
      renderChangeScopeSection(map.scope, "### Current map").trimEnd(),
      ""
    );
  }

  if (context.diffRefs) {
    try {
      const diff = await (context.compareCapabilityRefs ?? compareCapabilityRefs)({
        repoRoot: context.repoRoot,
        id,
        fromRef: context.diffRefs.baseRef,
        toRef: context.diffRefs.headRef,
        asOf: context.asOf
      });
      lines.push(renderCapabilityDiffSection(diff));
    } catch (error) {
      // Shallow checkouts often lack the base commit; say how to fix it instead of failing.
      lines.push(
        "### Base vs head",
        "",
        `Diff unavailable: ${message(error)} Fetch the base ref (for example \`actions/checkout\` with \`fetch-depth: 0\`) to compare.`,
        ""
      );
    }
  }
  return { markdown: lines.join("\n"), warnings };
}

export function renderCapabilityDiffSection(diff: CapabilityHistoryDiff): string {
  const lines = [
    "### Base vs head",
    "",
    diff.summary,
    "",
    `- Base ${markdownCode(diff.from.requestedRef)}: ${diff.from.state}`,
    `- Head ${markdownCode(diff.to.requestedRef)}: ${diff.to.state}`,
    `- Definition changed: ${diff.definitionChanged ? "yes" : "no"}`
  ];
  const categories: Array<[string, { added: string[]; removed: string[]; modified: string[] }]> = [
    ["Selected", diff.selected],
    ["Affected", diff.affected],
    ["Contracts", diff.contracts],
    ["Decisions", diff.decisions],
    ["Test associations", diff.testAssociations],
    ["Reviewers", diff.reviewers],
    ["Architecture findings", diff.architectureFindings]
  ];
  for (const [label, entry] of categories) {
    if (entry.added.length + entry.removed.length + entry.modified.length === 0) continue;
    lines.push(`- ${label}: +${entry.added.length} −${entry.removed.length} ~${entry.modified.length}`);
  }
  const pathChanges = [
    ...diff.selected.added.map((path) => `added selected ${markdownCode(path)}`),
    ...diff.selected.removed.map((path) => `removed selected ${markdownCode(path)}`),
    ...diff.affected.added.map((path) => `added affected ${markdownCode(path)}`),
    ...diff.affected.removed.map((path) => `removed affected ${markdownCode(path)}`)
  ];
  if (pathChanges.length > 0) {
    lines.push("", "Path changes:", "", ...pathChanges.slice(0, SECTION_PATH_LIMIT).map((entry) => `- ${entry}`));
    if (pathChanges.length > SECTION_PATH_LIMIT) lines.push(`- …and ${(pathChanges.length - SECTION_PATH_LIMIT).toLocaleString()} more`);
  }
  lines.push(
    "",
    "Both sides were read from Git objects without a checkout. Run `fixmap capability diff` for the complete comparison.",
    ""
  );
  return lines.join("\n");
}

/** Matches the CLI default so the same checkout yields the same scope identities. */
function repositoryId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "").slice(0, 64) || "repository";
}

/** Same code-span rendering as Core's report renderer, so repository paths cannot break out. */
export function markdownCode(value: string): string {
  const longestRun = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longestRun + 1);
  const pad = /^[` ]|[` ]$/.test(value) ? " " : "";
  return `${fence}${pad}${value}${pad}${fence}`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_[\]<>#|]/g, (character) => `\\${character}`);
}

/** Git failures carry multi-line stderr; one bounded line keeps the comment readable. */
export function message(error: unknown): string {
  const text = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim();
  const bounded = text.length > 300 ? `${text.slice(0, 299)}…` : text;
  return /[.…]$/.test(bounded) ? bounded : `${bounded}.`;
}
