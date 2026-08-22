import { extractTaskSignals } from "./signals.js";
import { markdownCode } from "./markdown.js";
import { isFixMapArtifact } from "./artifacts.js";
import type { FixMapReport, RepoFile, RepoMap } from "./types.js";

export type ContextSnippet = {
  path: string;
  role: "primary" | "supporting";
  startLine: number;
  endLine: number;
  language: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  estimatedTokens: number;
  sourceTruncated: boolean;
  content: string;
};

export type ContextPack = {
  contextVersion: 1;
  task: string;
  budgetTokens: number;
  estimatedSourceTokens: number;
  tokenEstimate: "utf8-bytes-divided-by-4";
  snippets: ContextSnippet[];
  omitted: Array<{ path: string; reason: "budget" | "unavailable" | "empty" | "fixmap-artifact" }>;
};

type Candidate = {
  path: string;
  role: ContextSnippet["role"];
  confidence: ContextSnippet["confidence"];
  reason: string;
};

const MAX_CANDIDATES = 15;
const MIN_SNIPPET_TOKENS = 48;

/**
 * Turns an already-grounded plan into bounded source ranges. This remains deliberately
 * lexical: no model chooses a symbol, and the estimate is stable across tokenizers.
 */
export function buildContextPack(input: {
  report: FixMapReport;
  repo: RepoMap;
  task: string;
  budgetTokens: number;
}): ContextPack {
  const candidates = contextCandidates(input.report);
  const fileByPath = new Map(input.repo.files.map((file) => [file.path, file]));
  const signals = extractTaskSignals({
    issueText: input.task,
    diffText: input.repo.diffText,
    changedFiles: input.repo.changedFiles
  });
  const terms = [...signals.tokens];
  const identifiers = [...signals.identifiers, ...signals.memberMentions];
  const snippets: ContextSnippet[] = [];
  const omitted: ContextPack["omitted"] = [];
  let remaining = input.budgetTokens;

  for (const candidate of candidates) {
    const file = fileByPath.get(candidate.path);
    if (!file) {
      omitted.push({ path: candidate.path, reason: "unavailable" });
      continue;
    }
    if (isFixMapArtifact(file)) {
      omitted.push({ path: candidate.path, reason: "fixmap-artifact" });
      continue;
    }
    if (!file.textSample.trim()) {
      omitted.push({ path: candidate.path, reason: "empty" });
      continue;
    }
    if (remaining < MIN_SNIPPET_TOKENS) {
      omitted.push({ path: candidate.path, reason: "budget" });
      continue;
    }

    const share = Math.min(
      remaining,
      Math.max(MIN_SNIPPET_TOKENS, Math.floor(input.budgetTokens * (candidate.role === "primary" ? 0.4 : 0.25)))
    );
    const range = selectRange(file, terms, identifiers, share);
    if (!range) {
      omitted.push({ path: candidate.path, reason: "budget" });
      continue;
    }
    snippets.push({
      path: candidate.path,
      role: candidate.role,
      startLine: range.startLine,
      endLine: range.endLine,
      language: languageForPath(candidate.path),
      reason: candidate.reason,
      confidence: candidate.confidence,
      estimatedTokens: range.estimatedTokens,
      sourceTruncated: file.textSampleComplete === false,
      content: range.content
    });
    remaining -= range.estimatedTokens;
  }

  return {
    contextVersion: 1,
    task: input.task,
    budgetTokens: input.budgetTokens,
    estimatedSourceTokens: snippets.reduce((total, snippet) => total + snippet.estimatedTokens, 0),
    tokenEstimate: "utf8-bytes-divided-by-4",
    snippets,
    omitted
  };
}

export function estimateContextTokens(text: string): number {
  return Math.ceil(new TextEncoder().encode(text).byteLength / 4);
}

export function renderContextPackMarkdown(pack: ContextPack): string {
  const lines = [
    "# FixMap Context",
    "",
    "## Task",
    "",
    pack.task || "No task text was supplied; ranges were selected from diff evidence.",
    "",
    `Source budget: ${pack.budgetTokens.toLocaleString("en-US")} estimated tokens. Included: ${pack.estimatedSourceTokens.toLocaleString("en-US")}.`,
    "Estimate: UTF-8 bytes divided by four; headings and metadata are outside the source budget.",
    ""
  ];

  for (const role of ["primary", "supporting"] as const) {
    const selected = pack.snippets.filter((snippet) => snippet.role === role);
    if (selected.length === 0) continue;
    lines.push(`## ${role === "primary" ? "Primary" : "Supporting"} Context`, "");
    for (const snippet of selected) {
      lines.push(
        `### ${markdownCode(snippet.path)}:${snippet.startLine}-${snippet.endLine}`,
        "",
        `${snippet.confidence} confidence · ~${snippet.estimatedTokens.toLocaleString("en-US")} tokens · ${snippet.reason}` +
          (snippet.sourceTruncated ? " · selected from the scanner's bounded text sample" : ""),
        "",
        `${safeFence(snippet.content)}${snippet.language}`,
        snippet.content,
        safeFence(snippet.content),
        ""
      );
    }
  }

  if (pack.omitted.length > 0) {
    lines.push("## Omitted", "");
    for (const entry of pack.omitted) lines.push(`- ${markdownCode(entry.path)}: ${entry.reason}`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function contextCandidates(report: FixMapReport): Candidate[] {
  const candidates: Candidate[] = report.contextFiles.map((file) => ({
    path: file.path,
    role: "primary",
    confidence: file.confidence,
    reason: file.reasons.slice(0, 2).join("; ") || "ranked primary context"
  }));
  const seen = new Set(candidates.map((candidate) => candidate.path));
  for (const file of report.impact?.files ?? []) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    candidates.push({
      path: file.path,
      role: "supporting",
      confidence: file.confidence,
      reason: file.evidence.slice(0, 2).map((evidence) => evidence.reason).join("; ") || "impact evidence"
    });
  }
  return candidates.slice(0, MAX_CANDIDATES);
}

function selectRange(
  file: RepoFile,
  terms: string[],
  identifiers: string[],
  allowance: number
): { startLine: number; endLine: number; content: string; estimatedTokens: number } | undefined {
  const lines = file.textSample.replace(/\r\n?/g, "\n").split("\n");
  const whole = lines.join("\n");
  const wholeTokens = estimateContextTokens(whole);
  if (wholeTokens <= allowance) {
    return { startLine: 1, endLine: lines.length, content: whole, estimatedTokens: wholeTokens };
  }

  let anchor = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < lines.length; index += 1) {
    const score = scoreLine(lines[index]!, terms, identifiers, index);
    if (score > bestScore) {
      bestScore = score;
      anchor = index;
    }
  }

  let start = anchor;
  let end = anchor;
  let content = lines[anchor] ?? "";
  let tokens = estimateContextTokens(content);
  if (tokens > allowance) {
    const maxBytes = allowance * 4;
    content = truncateUtf8(content, maxBytes);
    tokens = estimateContextTokens(content);
  }
  let preferBefore = true;
  while (tokens < allowance && (start > 0 || end < lines.length - 1)) {
    const sides = preferBefore ? ["before", "after"] as const : ["after", "before"] as const;
    let expanded = false;
    for (const side of sides) {
      const nextStart = side === "before" && start > 0 ? start - 1 : start;
      const nextEnd = side === "after" && end < lines.length - 1 ? end + 1 : end;
      if (nextStart === start && nextEnd === end) continue;
      const proposed = lines.slice(nextStart, nextEnd + 1).join("\n");
      const proposedTokens = estimateContextTokens(proposed);
      if (proposedTokens > allowance) continue;
      start = nextStart;
      end = nextEnd;
      content = proposed;
      tokens = proposedTokens;
      expanded = true;
      break;
    }
    if (!expanded) break;
    preferBefore = !preferBefore;
  }
  if (tokens < MIN_SNIPPET_TOKENS && allowance >= MIN_SNIPPET_TOKENS && content.trim().length === 0) return undefined;
  return { startLine: start + 1, endLine: end + 1, content, estimatedTokens: tokens };
}

function scoreLine(line: string, terms: string[], identifiers: string[], index: number): number {
  const lower = line.toLowerCase();
  let score = -index / 100_000;
  for (const identifier of identifiers) {
    if (line.includes(identifier)) score += 12;
    else if (lower.includes(identifier.toLowerCase())) score += 7;
  }
  for (const term of terms) if (lower.includes(term.toLowerCase())) score += 2;
  if (/\b(?:class|function|interface|type|enum|def|fn|func|const|let|var)\b/.test(line)) score += 1;
  return score;
}

function truncateUtf8(text: string, maxBytes: number): string {
  let output = "";
  let bytes = 0;
  for (const character of text) {
    const next = new TextEncoder().encode(character).byteLength;
    if (bytes + next > maxBytes) break;
    output += character;
    bytes += next;
  }
  return output;
}

function safeFence(content: string): string {
  const longest = Math.max(0, ...[...content.matchAll(/`+/g)].map((match) => match[0].length));
  return "`".repeat(Math.max(3, longest + 1));
}

function languageForPath(path: string): string {
  const basename = path.replaceAll("\\", "/").split("/").at(-1) ?? path;
  const extension = basename.includes(".") ? basename.split(".").at(-1)!.toLowerCase() : "";
  return ({
    cjs: "javascript", js: "javascript", jsx: "jsx", mjs: "javascript",
    ts: "typescript", tsx: "tsx", py: "python", rb: "ruby", rs: "rust",
    yml: "yaml", md: "markdown", mdx: "mdx", sh: "bash", ps1: "powershell"
  } as Record<string, string>)[extension] ?? extension;
}
