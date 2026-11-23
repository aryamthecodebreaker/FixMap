import {
  compareArchitectureRefs,
  compareContractRefs,
  reviewRoutingWithoutMentions,
  routeReviewers,
  scanRepo,
  withoutMentions,
  type ArchitectureRefComparison,
  type ContractChange,
  type ContractRefComparison,
  type ReviewRoutingResult
} from "@aryam/fixmap-core";
import { SECTION_PATH_LIMIT, markdownCode, message } from "./scope-sections.js";

export type ReviewSectionRequest = {
  contracts: boolean;
  reviewers: boolean;
  /** Mirrors `fixmap reviewers --no-history-authors` when false. */
  reviewersHistoryAuthors: boolean;
  architectureDrift: boolean;
};

export type ReviewSectionContext = {
  repoRoot: string;
  useCache: boolean;
  now: string;
  /** Paths reviewers are routed for: the report's changed files, else its context files. */
  changedPaths: readonly string[];
  /** Present only on pull requests whose base and head refs are both known. */
  diffRefs?: { baseRef: string; headRef: string };
  scanRepo?: typeof scanRepo;
  compareContractRefs?: typeof compareContractRefs;
  compareArchitectureRefs?: typeof compareArchitectureRefs;
};

export type ReviewSections = {
  markdown: string;
  warnings: string[];
  breakingContractCount?: number;
};

export function hasReviewSections(request: ReviewSectionRequest): boolean {
  return request.contracts || request.reviewers || request.architectureDrift;
}

const REFS_NEEDED =
  "needs a pull request with both base and head refs. Fetch the base ref (for example `actions/checkout` with `fetch-depth: 0`) to compare.";

/**
 * Runs the same Core engines as `fixmap contracts diff`, `fixmap reviewers`, and
 * `fixmap history`. Everything is read-only: both refs are read from Git objects without a
 * checkout, nobody is asked to review, and no failure here fails the job.
 */
export async function buildReviewSections(request: ReviewSectionRequest, context: ReviewSectionContext): Promise<ReviewSections> {
  const sections: string[] = [];
  const warnings: string[] = [];
  let breakingContractCount: number | undefined;

  if (request.contracts) {
    const heading = "## Contract changes (preview)";
    if (!context.diffRefs) {
      sections.push([heading, "", `Contract comparison ${REFS_NEEDED}`, ""].join("\n"));
      warnings.push(`FixMap contract comparison ${REFS_NEEDED}`);
    } else {
      try {
        const result = await (context.compareContractRefs ?? compareContractRefs)({
          repoRoot: context.repoRoot,
          fromRef: context.diffRefs.baseRef,
          toRef: context.diffRefs.headRef
        });
        breakingContractCount = result.comparison.changes.filter((change) => change.compatibility === "breaking").length;
        sections.push(renderContractSection(result));
      } catch (error) {
        sections.push([heading, "", `Contract comparison unavailable: ${message(error)} ${REFS_NEEDED}`, ""].join("\n"));
        warnings.push(`FixMap contract comparison unavailable: ${message(error)}`);
      }
    }
  }

  if (request.reviewers) {
    const heading = "## Suggested reviewers (preview)";
    try {
      const repo = await (context.scanRepo ?? scanRepo)({
        repoRoot: context.repoRoot,
        useCache: context.useCache,
        includeHistory: request.reviewersHistoryAuthors
      });
      const scanError = repo.diagnostics.find((diagnostic) => diagnostic.severity === "error");
      if (scanError) throw new Error(scanError.message);
      const result = routeReviewers(repo, {
        changedPaths: context.changedPaths,
        now: context.now,
        includeHistoryAuthors: request.reviewersHistoryAuthors
      });
      sections.push(renderReviewerSection(result));
    } catch (error) {
      const detail = withoutMentions(message(error));
      sections.push([heading, "", `Reviewer suggestions unavailable: ${detail}`, ""].join("\n"));
      warnings.push(`FixMap reviewer suggestions unavailable: ${detail}`);
    }
  }

  if (request.architectureDrift) {
    const heading = "## Architecture drift (preview)";
    if (!context.diffRefs) {
      sections.push([heading, "", `Architecture drift ${REFS_NEEDED}`, ""].join("\n"));
      warnings.push(`FixMap architecture drift ${REFS_NEEDED}`);
    } else {
      try {
        const result = await (context.compareArchitectureRefs ?? compareArchitectureRefs)({
          repoRoot: context.repoRoot,
          fromRef: context.diffRefs.baseRef,
          toRef: context.diffRefs.headRef,
          useCache: context.useCache
        });
        sections.push(renderArchitectureDriftSection(result));
      } catch (error) {
        sections.push([heading, "", `Architecture drift unavailable: ${message(error)} ${REFS_NEEDED}`, ""].join("\n"));
        warnings.push(`FixMap architecture drift unavailable: ${message(error)}`);
      }
    }
  }

  return {
    markdown: sections.join("\n"),
    warnings,
    ...(breakingContractCount !== undefined ? { breakingContractCount } : {})
  };
}

const COMPATIBILITY_ORDER = { breaking: 0, unknown: 1, compatible: 2 } as const;

export function renderContractSection(result: ContractRefComparison): string {
  const { changes } = result.comparison;
  const count = (compatibility: ContractChange["compatibility"]) =>
    changes.filter((change) => change.compatibility === compatibility).length;
  const lines = [
    "## Contract changes (preview)",
    "",
    // Reasons quote contract text, where a GraphQL directive such as `@deprecated` would mention someone.
    withoutMentions(result.comparison.summary),
    "",
    `- Breaking: ${count("breaking").toLocaleString()}`,
    `- Unknown: ${count("unknown").toLocaleString()}`,
    `- Compatible: ${count("compatible").toLocaleString()}`,
    ""
  ];
  if (changes.length > 0) {
    const ordered = [...changes].sort((a, b) =>
      COMPATIBILITY_ORDER[a.compatibility] - COMPATIBILITY_ORDER[b.compatibility] || a.path.localeCompare(b.path));
    lines.push("Top changes:", "");
    lines.push(...ordered.slice(0, SECTION_PATH_LIMIT).map((change) =>
      `- ${change.compatibility} ${markdownCode(change.path)} (${change.contractKind}): ${withoutMentions(change.reason)}`));
    if (changes.length > SECTION_PATH_LIMIT) lines.push(`- …and ${(changes.length - SECTION_PATH_LIMIT).toLocaleString()} more`);
    lines.push("");
  }
  if (result.comparison.diagnostics.length > 0) {
    lines.push(`Contracts not compared: ${result.comparison.diagnostics.length.toLocaleString()}; run the CLI for details.`, "");
  }
  lines.push(
    `Base ${markdownCode(result.from.requestedRef)} at ${markdownCode(result.from.commit)}; head ${markdownCode(result.to.requestedRef)} at ${markdownCode(result.to.commit)}. ` +
      "Both sides were read from Git objects without a checkout. Breaking changes are advisory and never fail this step. " +
      "Run `fixmap contracts diff` for the complete comparison.",
    ""
  );
  return lines.join("\n");
}

const EVIDENCE_LABEL = {
  codeowners: "CODEOWNERS",
  annotation: "annotation",
  "architecture-policy": "architecture policy",
  "git-history": "commit history"
} as const;

/** Names print without `@` and nothing here requests a review, so nobody is notified. */
export function renderReviewerSection(input: ReviewRoutingResult): string {
  const result = reviewRoutingWithoutMentions(input);
  const lines = [
    "## Suggested reviewers (preview)",
    "",
    "Suggestions only. FixMap does not request reviews or notify anyone, and a name is not evidence of identity, employment, or current availability.",
    ""
  ];
  if (result.changedPaths.length === 0) {
    lines.push("No changed paths, so there is nothing to route.", "");
  } else {
    const covered = new Set(result.suggestions.flatMap((suggestion) => suggestion.paths));
    const uncovered = result.changedPaths.filter((path) => !covered.has(path));
    lines.push(
      `- Changed paths routed: ${result.changedPaths.length.toLocaleString()}`,
      `- Suggested reviewers: ${result.suggestions.length.toLocaleString()}`,
      `- Paths without reviewer evidence: ${uncovered.length.toLocaleString()}`,
      ""
    );
    if (result.suggestions.length > 0) {
      for (const suggestion of result.suggestions.slice(0, SECTION_PATH_LIMIT)) {
        const sources = [...new Set(suggestion.evidence.map((entry) => EVIDENCE_LABEL[entry.kind]))].join(", ");
        const paths = suggestion.paths.slice(0, 3).map(markdownCode).join(", ");
        const more = suggestion.paths.length > 3 ? ` and ${(suggestion.paths.length - 3).toLocaleString()} more` : "";
        lines.push(`- ${markdownCode(suggestion.reviewer)} (${suggestion.confidence}; ${sources}): ${paths}${more}`);
      }
      if (result.suggestions.length > SECTION_PATH_LIMIT) {
        lines.push(`- …and ${(result.suggestions.length - SECTION_PATH_LIMIT).toLocaleString()} more`);
      }
      lines.push("");
    }
  }
  const warnings = result.diagnostics.filter((entry) => entry.severity === "warning");
  if (warnings.length > 0) {
    lines.push(...warnings.slice(0, SECTION_PATH_LIMIT).map((entry) => `- warning (${markdownCode(entry.source)}): ${entry.message}`), "");
  }
  lines.push("Run `fixmap reviewers` for the per-path evidence.", "");
  return lines.join("\n");
}

export function renderArchitectureDriftSection(result: ArchitectureRefComparison): string {
  const { drift } = result;
  const edge = (entry: { from: string; to: string }) => `${markdownCode(entry.from)} -> ${markdownCode(entry.to)}`;
  const lines = [
    "## Architecture drift (preview)",
    "",
    `- Added edges: ${drift.addedEdges.length.toLocaleString()}`,
    `- Removed edges: ${drift.removedEdges.length.toLocaleString()}`,
    `- New cycles: ${drift.newCycles.length.toLocaleString()} (resolved: ${drift.resolvedCycles.length.toLocaleString()})`,
    `- New policy violations: ${drift.newBoundaryViolations.length.toLocaleString()} (resolved: ${drift.resolvedBoundaryViolations.length.toLocaleString()})`,
    `- Decision disagreements: ${result.decisionDisagreements.length.toLocaleString()} (introduced here: ${result.decisionDisagreements.filter((entry) => entry.introduced).length.toLocaleString()})`,
    ""
  ];
  const list = <T>(title: string, values: readonly T[], render: (value: T) => string) => {
    if (values.length === 0) return;
    lines.push(`${title}:`, "", ...values.slice(0, SECTION_PATH_LIMIT).map((value) => `- ${render(value)}`));
    if (values.length > SECTION_PATH_LIMIT) lines.push(`- …and ${(values.length - SECTION_PATH_LIMIT).toLocaleString()} more`);
    lines.push("");
  };
  list("New cycles", drift.newCycles, (cycle) => cycle.map(markdownCode).join(" -> "));
  list("New policy violations", drift.newBoundaryViolations, (entry) => `${markdownCode(entry.ruleId)}: ${edge(entry)}`);
  list("Decision disagreements", result.decisionDisagreements, (entry) =>
    `${markdownCode(entry.decisionPath)} denies ${markdownCode(entry.rule.from)} -> ${markdownCode(entry.rule.deny)}; ` +
      `${edge(entry.edge)} ${entry.introduced ? "was introduced in this range" : "already existed at the base"}`);
  list("Added edges", drift.addedEdges, edge);
  list("Removed edges", drift.removedEdges, edge);
  lines.push(
    `Base ${markdownCode(result.from.requestedRef)} at ${markdownCode(result.from.commit)}; head ${markdownCode(result.to.requestedRef)} at ${markdownCode(result.to.commit)}. ` +
      "Both sides were read from Git objects without a checkout. Run `fixmap history` for the complete comparison.",
    ""
  );
  return lines.join("\n");
}
