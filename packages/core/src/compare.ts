// The loop FixMap is actually for: plan, add an identifier the task was missing, re-plan,
// and watch whether the real file moved up. Doing that meant saving two JSON reports and
// diffing them by eye, which buries the one number that matters — did the fix site rise? —
// under everything that stayed the same.
//
// This compares two reports the caller already has. Nothing is scanned or re-ranked, so a
// comparison can be run long after the plans were made.

import type { FixMapReport, RankedFile } from "./types.js";

export type RankDelta = {
  path: string;
  status: "entered" | "left" | "moved" | "confidence-changed" | "unchanged";
  /** 1-based, absent on the side where the file was not listed. */
  previousRank?: number;
  currentRank?: number;
  previousScore?: number;
  currentScore?: number;
  previousConfidence?: RankedFile["confidence"];
  currentConfidence?: RankedFile["confidence"];
};

export type ReportComparison = {
  summary: string;
  entered: RankDelta[];
  left: RankDelta[];
  moved: RankDelta[];
  confidenceChanged: RankDelta[];
  unchanged: RankDelta[];
  groundingChanged: boolean;
  previousGrounding?: string;
  currentGrounding?: string;
};

export function compareReports(previous: FixMapReport, current: FixMapReport): ReportComparison {
  const previousByPath = indexByPath(previous.contextFiles);
  const currentByPath = indexByPath(current.contextFiles);

  const entered: RankDelta[] = [];
  const left: RankDelta[] = [];
  const moved: RankDelta[] = [];
  const confidenceChanged: RankDelta[] = [];
  const unchanged: RankDelta[] = [];

  for (const [path, currentEntry] of currentByPath) {
    const previousEntry = previousByPath.get(path);
    if (!previousEntry) {
      entered.push({
        path,
        status: "entered",
        currentRank: currentEntry.rank,
        currentScore: currentEntry.file.score,
        currentConfidence: currentEntry.file.confidence
      });
      continue;
    }

    const rankOrScoreChanged = previousEntry.rank !== currentEntry.rank || previousEntry.file.score !== currentEntry.file.score;
    const confidenceChangedOnly = !rankOrScoreChanged && previousEntry.file.confidence !== currentEntry.file.confidence;
    const delta: RankDelta = {
      path,
      status: rankOrScoreChanged ? "moved" : confidenceChangedOnly ? "confidence-changed" : "unchanged",
      previousRank: previousEntry.rank,
      currentRank: currentEntry.rank,
      previousScore: previousEntry.file.score,
      currentScore: currentEntry.file.score,
      previousConfidence: previousEntry.file.confidence,
      currentConfidence: currentEntry.file.confidence
    };
    (delta.status === "moved" ? moved : delta.status === "confidence-changed" ? confidenceChanged : unchanged).push(delta);
  }

  for (const [path, previousEntry] of previousByPath) {
    if (!currentByPath.has(path)) {
      left.push({
        path,
        status: "left",
        previousRank: previousEntry.rank,
        previousScore: previousEntry.file.score,
        previousConfidence: previousEntry.file.confidence
      });
    }
  }

  // Rank ascending, so the reader's eye lands on the top of the list first.
  entered.sort((a, b) => (a.currentRank ?? 0) - (b.currentRank ?? 0));
  left.sort((a, b) => (a.previousRank ?? 0) - (b.previousRank ?? 0));
  moved.sort((a, b) => (a.currentRank ?? 0) - (b.currentRank ?? 0));
  confidenceChanged.sort((a, b) => (a.currentRank ?? 0) - (b.currentRank ?? 0));
  unchanged.sort((a, b) => (a.currentRank ?? 0) - (b.currentRank ?? 0));

  const previousGrounding = previous.analysis?.grounding.specificity;
  const currentGrounding = current.analysis?.grounding.specificity;

  return {
    summary: buildSummary(entered, left, moved, confidenceChanged, previous.contextFiles[0], current.contextFiles[0]),
    entered,
    left,
    moved,
    confidenceChanged,
    unchanged,
    groundingChanged: previousGrounding !== currentGrounding,
    ...(previousGrounding ? { previousGrounding } : {}),
    ...(currentGrounding ? { currentGrounding } : {})
  };
}

function indexByPath(files: RankedFile[]): Map<string, { rank: number; file: RankedFile }> {
  return new Map(files.map((file, index) => [
    file.path,
    { rank: Number.isSafeInteger(file.rank) && file.rank > 0 ? file.rank : index + 1, file }
  ]));
}

function buildSummary(
  entered: RankDelta[],
  left: RankDelta[],
  moved: RankDelta[],
  confidenceChanged: RankDelta[],
  previousLeader: RankedFile | undefined,
  currentLeader: RankedFile | undefined
): string {
  if (entered.length === 0 && left.length === 0 && moved.length === 0 && confidenceChanged.length === 0) {
    return "Both plans rank the same files in the same order. Refining the task changed nothing.";
  }

  const parts = [
    entered.length > 0 ? `${entered.length} entered` : "",
    left.length > 0 ? `${left.length} left` : "",
    moved.length > 0 ? `${moved.length} moved` : "",
    confidenceChanged.length > 0 ? `${confidenceChanged.length} changed confidence` : ""
  ].filter(Boolean);

  // The leading file is the one an agent opens, so a change there is the headline.
  const lead = previousLeader?.path !== currentLeader?.path
    ? ` The leading file changed from ${previousLeader?.path ?? "nothing"} to ${currentLeader?.path ?? "nothing"}.`
    : "";

  return `${parts.join(", ")}.${lead}`;
}

export function renderComparisonMarkdown(comparison: ReportComparison): string {
  const lines = ["# FixMap Plan Comparison", "", comparison.summary, ""];

  if (comparison.groundingChanged) {
    lines.push(
      `Task grounding changed from **${comparison.previousGrounding ?? "unknown"}** ` +
      `to **${comparison.currentGrounding ?? "unknown"}**.`,
      ""
    );
  }

  appendSection(lines, "Entered", comparison.entered, (delta) =>
    `\`${delta.path}\` at rank ${delta.currentRank}${formatMetrics(delta.currentConfidence, delta.currentScore)}`);
  appendSection(lines, "Left", comparison.left, (delta) =>
    `\`${delta.path}\` was rank ${delta.previousRank}${formatMetrics(delta.previousConfidence, delta.previousScore)}`);
  appendSection(lines, "Moved", comparison.moved, (delta) =>
    `\`${delta.path}\` ${describeMove(delta)}`);
  appendSection(lines, "Confidence changed", comparison.confidenceChanged, (delta) =>
    `\`${delta.path}\` stayed at rank ${delta.currentRank}` +
    `${delta.currentScore === undefined ? "" : ` and score ${delta.currentScore}`}; confidence changed from ` +
    `${delta.previousConfidence ?? "unknown"} to ${delta.currentConfidence ?? "unknown"}`);

  if (comparison.unchanged.length > 0) {
    lines.push(`## Unchanged`, "", `${comparison.unchanged.length} file(s) held their rank, score, and confidence.`, "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function describeMove(delta: RankDelta): string {
  const direction = (delta.previousRank ?? 0) > (delta.currentRank ?? 0)
    ? "rose"
    : (delta.previousRank ?? 0) < (delta.currentRank ?? 0) ? "fell" : "held";
  const rank = direction === "held"
    ? `stayed at rank ${delta.currentRank}`
    : `${direction} from rank ${delta.previousRank} to ${delta.currentRank}`;
  const score = delta.previousScore === undefined && delta.currentScore === undefined
    ? ""
    : `score ${delta.previousScore ?? "unknown"} to ${delta.currentScore ?? "unknown"}`;
  const confidence = delta.previousConfidence === undefined && delta.currentConfidence === undefined
    ? ""
    : delta.previousConfidence === delta.currentConfidence
      ? `${delta.currentConfidence} confidence`
      : `confidence ${delta.previousConfidence ?? "unknown"} to ${delta.currentConfidence ?? "unknown"}`;
  return [rank, score, confidence].filter(Boolean).join(", ");
}

function formatMetrics(confidence: RankedFile["confidence"] | undefined, score: number | undefined): string {
  const metrics = [
    confidence ? `${confidence} confidence` : "",
    score === undefined ? "" : `score ${score}`
  ].filter(Boolean);
  return metrics.length > 0 ? ` (${metrics.join(", ")})` : "";
}

function appendSection(
  lines: string[],
  title: string,
  deltas: RankDelta[],
  format: (delta: RankDelta) => string
): void {
  if (deltas.length === 0) {
    return;
  }
  lines.push(`## ${title}`, "");
  for (const delta of deltas) {
    lines.push(`- ${format(delta)}`);
  }
  lines.push("");
}
