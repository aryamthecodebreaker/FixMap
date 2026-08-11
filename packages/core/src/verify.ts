// The second half of the job. `plan` answers "where should I start"; `verify` answers
// "did I finish safely" by comparing the plan against the diff that followed it.
//
// Every check compares two things FixMap already has — a recorded report and a real git
// diff — so nothing here executes repository code, installs anything, or calls a model.
// Findings are evidence about the gap between plan and change, not a correctness verdict:
// a plan can be wrong, a change can be right, and only a human or agent reading both can
// say which. The output says what differs and leaves that judgement alone.

import { isBackupPath, isGeneratedPath, moduleStem } from "./paths.js";
import { buildRiskNotes, pathsForRiskArea } from "./report.js";
import type { FixMapReport, RepoMap, VerifyFinding, VerifyResult } from "./types.js";
import { markdownCode } from "./markdown.js";

export function verifyPlan(report: FixMapReport, repo: RepoMap): VerifyResult {
  const changed = repo.changedFiles;
  const findings: VerifyFinding[] = [];
  const fileByPath = new Map(repo.files.map((file) => [file.path, file]));
  const plannedPaths = report.contextFiles.map((file) => file.path);

  const missingPlanned = plannedPaths.filter((path) => !fileByPath.has(path));
  const changedMissingPlanned = missingPlanned.filter((path) => changed.includes(path));
  const unexplainedMissingPlanned = missingPlanned.filter((path) => !changed.includes(path));

  if (plannedPaths.length > 0 && unexplainedMissingPlanned.length === plannedPaths.length) {
    const mismatch: VerifyFinding = {
      code: "plan-repository-mismatch",
      severity: "error",
      paths: plannedPaths.slice(0, 8),
      message:
        `Verification was not attempted: none of the ${plannedPaths.length} planned files exist in ${repo.root}. ` +
        "This plan appears to be for a different repository or revision; check --repo or regenerate the plan against this checkout."
    };
    return {
      summary: `None of the ${plannedPaths.length} planned files exist in ${repo.root}; the plan and repository do not match.`,
      changedFiles: changed,
      findings: [mismatch],
      diagnostics: repo.diagnostics
    };
  }

  if (unexplainedMissingPlanned.length > 0) {
    findings.push({
      code: "plan-partially-stale",
      severity: "warning",
      paths: unexplainedMissingPlanned.slice(0, 8),
      message:
        `${unexplainedMissingPlanned.length} of ${plannedPaths.length} planned paths no longer exist and are not explained by this diff. ` +
        "The plan may predate a rebase or rename; regenerate it before relying on the missing entries."
    });
  }
  if (changedMissingPlanned.length > 0) {
    findings.push({
      code: "planned-file-deleted",
      severity: "info",
      paths: changedMissingPlanned.slice(0, 8),
      message:
        `${changedMissingPlanned.length === 1 ? "A planned file was" : `${changedMissingPlanned.length} planned files were`} removed by this diff. ` +
        "The deletion accounts for the missing path, so verification continued."
    });
  }

  if (changed.length === 0) {
    return {
      summary: "No changes to verify: the diff resolved to zero files.",
      changedFiles: [],
      findings,
      diagnostics: repo.diagnostics
    };
  }

  const planned = new Set(plannedPaths);
  const isTest = (path: string) => fileByPath.get(path)?.isTest === true;

  // 1. Edits somewhere the next build discards. This is the only finding that is
  //    wrong regardless of what the task was.
  const maintainedStems = new Set(
    repo.files
      .filter((file) => file.isSource && !isGeneratedPath(file.path) && !isBackupPath(file.path))
      .map((file) => moduleStem(file.path))
  );
  const tracked = new Set(repo.trackedFiles ?? []);
  const discardedEdits = changed.filter((path) =>
    isBackupPath(path) ||
    (isGeneratedPath(path) && maintainedStems.has(moduleStem(path)) && !tracked.has(path))
  );
  if (discardedEdits.length > 0) {
    findings.push({
      code: "edit-in-generated-location",
      severity: "error",
      paths: discardedEdits,
      message:
        `${discardedEdits.length === 1 ? "A file was" : `${discardedEdits.length} files were`} edited in a generated or retired location. ` +
        "A build regenerates these, so the change will be lost. Edit the source they are produced from."
    });
  }

  const trackedGeneratedEdits = changed.filter((path) =>
    isGeneratedPath(path) && maintainedStems.has(moduleStem(path)) && tracked.has(path)
  );
  if (trackedGeneratedEdits.length > 0) {
    findings.push({
      code: "tracked-generated-edit",
      severity: "warning",
      paths: trackedGeneratedEdits,
      message:
        `${trackedGeneratedEdits.length === 1 ? "A committed generated artifact was" : `${trackedGeneratedEdits.length} committed generated artifacts were`} edited. ` +
        "Confirm the maintained source changed too and the artifact was rebuilt; tracked release artifacts are not treated as discarded edits."
    });
  }

  // 2. Files the change needed that the map never offered. This is the honest measure
  //    of whether the plan was complete, and it is the finding worth acting on.
  const unmapped = changed.filter((path) =>
    !planned.has(path) &&
    !isTest(path) &&
    !discardedEdits.includes(path) &&
    !trackedGeneratedEdits.includes(path) &&
    fileByPath.get(path)?.isSource !== false
  );
  if (unmapped.length > 0) {
    findings.push({
      code: "unmapped-change",
      severity: "warning",
      paths: unmapped,
      message:
        `${unmapped.length === 1 ? "One file" : `${unmapped.length} files`} changed that the plan did not rank. ` +
        "Either the task grew beyond the original description, or the ranking missed them — worth checking which."
    });
  }

  // 3. The plan's best guess going untouched is worth surfacing, not condemning. It
  //    happens legitimately when a file is read for context and needs no edit.
  const leading = report.contextFiles[0];
  if (leading && !changed.includes(leading.path)) {
    findings.push({
      code: "leading-file-untouched",
      severity: leading.confidence === "high" ? "warning" : "info",
      paths: [leading.path],
      message:
        `The highest-ranked file was not changed (${leading.confidence} confidence). ` +
        "That is expected if it was only read for context, and worth a second look if it was not opened at all."
    });
  }

  // 4. Source moved without any test moving. Test routes name what would exercise it.
  const changedSource = changed.filter((path) =>
    !isTest(path) &&
    !trackedGeneratedEdits.includes(path) &&
    !discardedEdits.includes(path) &&
    fileByPath.get(path)?.kind === "code"
  );
  const changedTests = changed.filter(isTest);
  if (changedSource.length > 0 && changedTests.length === 0) {
    const suggested = [...new Set(report.testRoutes.flatMap((route) => route.relatedFiles))].filter(isTest);
    // Findings are consumed as anchored records. When a route has only a command (or its
    // relatedFiles are implementation context), anchor the warning to the changed source
    // instead of emitting the unusable `paths: []` shape.
    const anchors = suggested.length > 0 ? suggested : changedSource;
    findings.push({
      code: "no-test-changed",
      severity: "warning",
      paths: anchors,
      message:
        suggested.length > 0
          ? `Code changed but no test did. The plan routed ${suggested.length === 1 ? "this test" : "these tests"} as most related.`
          : report.testRoutes.length > 0
            ? `Code changed but no test did. Run the routed ${report.testRoutes.length === 1 ? "command" : "commands"}: ${report.testRoutes.map((route) => route.command).join(", ")}.`
            : "Code changed but no test did, and the plan found no related test to point at."
    });
  }

  // 5. Risk the plan never mentioned, because the change reached further than the map did.
  const plannedAreas = new Set(report.risks.map((risk) => risk.area));
  const newRisks = buildRiskNotes(changed, changed).filter((risk) => !plannedAreas.has(risk.area));
  for (const risk of newRisks) {
    findings.push({
      code: "new-risk-area",
      severity: "warning",
      paths: pathsForRiskArea(risk.area, changed),
      message: `The change touches ${risk.area}, which the original plan did not flag: ${risk.reason}.`
    });
  }

  return {
    summary: buildVerifySummary(changed.length, findings),
    changedFiles: changed,
    findings,
    diagnostics: repo.diagnostics
  };
}

function buildVerifySummary(changedCount: number, findings: VerifyFinding[]): string {
  const files = `${changedCount} changed ${changedCount === 1 ? "file" : "files"}`;
  if (findings.length === 0) {
    return `FixMap verified ${files} against the plan and found nothing to flag.`;
  }
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  const counts = [
    errors > 0 ? `${errors} ${errors === 1 ? "error" : "errors"}` : "",
    warnings > 0 ? `${warnings} ${warnings === 1 ? "warning" : "warnings"}` : ""
  ].filter(Boolean);
  const tail = counts.length > 0 ? counts.join(" and ") : `${findings.length} note${findings.length === 1 ? "" : "s"}`;
  return `FixMap verified ${files} against the plan and raised ${tail}.`;
}

export function renderVerifyMarkdown(result: VerifyResult): string {
  // Nothing changed, so there is nothing to have findings *about*. Printing two empty
  // sections is technically accurate and reads like a display bug — the honest rendering
  // says why the sections are absent and what would make them appear.
  if (result.changedFiles.length === 0) {
    return [
      "# FixMap Verification",
      "",
      result.summary,
      "",
      "Nothing was compared against the plan. Run verify with a diff that contains the edit, " +
      "such as `--diff HEAD~1...HEAD`.",
      ""
    ].join("\n");
  }

  const lines = ["# FixMap Verification", "", result.summary, "", "## Findings", ""];
  if (result.findings.length === 0) {
    lines.push("- None found");
  } else {
    for (const finding of result.findings) {
      lines.push(`- **${finding.severity}** ${finding.message}`);
      for (const path of finding.paths.slice(0, 8)) {
        lines.push(`  - ${markdownCode(path)}`);
      }
    }
  }
  lines.push("", "## Changed Files", "");
  lines.push(...(result.changedFiles.length > 0 ? result.changedFiles.map((path) => `- ${markdownCode(path)}`) : ["- None found"]));
  return `${lines.join("\n")}\n`;
}
