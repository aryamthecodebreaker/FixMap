import type { RepoFile } from "./types.js";

export type FixMapArtifactKind =
  | "agent-command"
  | "context-json"
  | "context-markdown"
  | "report-json"
  | "report-markdown"
  | "verify-json";

const AGENT_COMMAND_PATHS = new Set([
  ".agents/skills/fixmap/skill.md",
  ".claude/skills/fixmap/skill.md",
  ".cursor/commands/fixmap.md",
  ".github/prompts/fixmap.prompt.md"
]);
const AGENT_COMMAND_MARKER = "You are the FixMap workflow assistant for this repository.";

/**
 * Identifies FixMap's own generated documents from their contract, not their filename.
 * A team may legitimately own `plan.json`; it is excluded only when its contents carry a
 * FixMap report/context/verify shape. Parsing is bounded by the scanner text sample.
 */
export function fixMapArtifactKind(file: Pick<RepoFile, "path" | "textSample" | "textSampleComplete">): FixMapArtifactKind | undefined {
  const text = file.textSample.trimStart();
  if (!text) return undefined;
  if (AGENT_COMMAND_PATHS.has(file.path.replace(/\\/g, "/").toLowerCase()) && text.includes(AGENT_COMMAND_MARKER)) {
    return "agent-command";
  }
  if (text.startsWith("# FixMap Report\n") && text.includes("\n## Context Files\n")) return "report-markdown";
  if (text.startsWith("# FixMap Context\n") && text.includes("\n## Task\n")) return "context-markdown";
  if (!file.path.toLowerCase().endsWith(".json") || file.textSampleComplete === false) return undefined;

  let candidate: unknown;
  try {
    candidate = JSON.parse(file.textSample);
  } catch {
    return undefined;
  }
  if (!isRecord(candidate)) return undefined;
  if (
    (candidate.reportVersion === undefined || candidate.reportVersion === 1) &&
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.contextFiles) &&
    Array.isArray(candidate.testRoutes) &&
    Array.isArray(candidate.risks) &&
    Array.isArray(candidate.changedFiles) &&
    Array.isArray(candidate.diagnostics)
  ) return "report-json";
  if (
    candidate.contextVersion === 1 &&
    typeof candidate.task === "string" &&
    typeof candidate.budgetTokens === "number" &&
    candidate.tokenEstimate === "utf8-bytes-divided-by-4" &&
    Array.isArray(candidate.snippets) &&
    Array.isArray(candidate.omitted)
  ) return "context-json";
  if (
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.changedFiles) &&
    Array.isArray(candidate.findings) &&
    Array.isArray(candidate.diagnostics)
  ) return "verify-json";
  return undefined;
}

export function isFixMapArtifact(file: Pick<RepoFile, "path" | "textSample" | "textSampleComplete">): boolean {
  return fixMapArtifactKind(file) !== undefined;
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}
