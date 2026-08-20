"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle,
  FileText,
  GitBranch,
  ShieldCheck,
  Warning
} from "@phosphor-icons/react";
import { quoteCliValue } from "@aryam/fixmap-core/browser";
import {
  buildHomepageReport,
  homepageDefaultReport,
  homepageDefaultTask,
  homepagePresets,
  selectHomepageEvidence
} from "../_lib/homepage-demo";

function candidateReason(reasons: string[]): string | undefined {
  return (
    reasons.find((reason) => reason.startsWith("defines task identifiers")) ??
    reasons[0]
  );
}

export function InteractiveMapStage() {
  const [draftTask, setDraftTask] = useState<string>(homepageDefaultTask);
  const [submittedTask, setSubmittedTask] = useState<string>(homepageDefaultTask);
  const [runCount, setRunCount] = useState(0);
  const report = useMemo(
    () => submittedTask === homepageDefaultTask ? homepageDefaultReport : buildHomepageReport(submittedTask),
    [submittedTask]
  );
  const { editCandidate, impactFile, testRoute, risk, diagnostic } = useMemo(
    () => selectHomepageEvidence(report),
    [report]
  );
  const command = `fixmap plan --issue ${quoteCliValue(submittedTask, "posix")} --format agent`;
  const editCandidateReason = editCandidate ? candidateReason(editCandidate.reasons) : undefined;
  const impactReason = impactFile?.evidence[0]?.reason;
  const status = runCount === 0
    ? ""
    : editCandidate
      ? `FixMap run ${runCount} complete. ${report.contextFiles.length} file candidates surfaced. First candidate: ${editCandidate.path}.`
      : `FixMap run ${runCount} complete. No grounded file candidates surfaced.`;

  function runFixMap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedTask(draftTask.trim());
    setRunCount((count) => count + 1);
  }

  return (
    <figure className="real-report-stage" aria-labelledby="real-report-title">
      <figcaption className="real-report-toolbar" id="real-report-title">
        <span><ShieldCheck size={18} weight="duotone" aria-hidden /><strong>Try FixMap on a sample project</strong></span>
        <span>Runs in this tab</span>
      </figcaption>

      <div className="real-report-flow">
        <section className="real-report-input" aria-label="Input to FixMap">
          <span className="real-report-label">1. Tell FixMap</span>
          <strong>What is broken?</strong>

          <form className="real-report-form" onSubmit={runFixMap}>
            <label htmlFor="homepage-fixmap-task">Describe the problem</label>
            <textarea
              id="homepage-fixmap-task"
              value={draftTask}
              onChange={(event) => setDraftTask(event.target.value)}
              rows={3}
              aria-describedby="homepage-fixmap-help"
            />
            <p id="homepage-fixmap-help">Change the text or choose an example. Then press Run FixMap.</p>

            <div className="real-report-presets" role="group" aria-label="Example software tasks">
              {homepagePresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={draftTask === preset.task}
                  onClick={() => setDraftTask(preset.task)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="real-report-actions">
              <div className="real-report-repo">
                <GitBranch size={17} aria-hidden />
                <span><b>Sample project</b> sample-api</span>
              </div>
              <button className="real-report-run" type="submit">
                Run FixMap <ArrowRight size={16} weight="bold" aria-hidden />
              </button>
            </div>
          </form>

          <code className="real-report-command">{command}</code>
        </section>

        <div className="real-report-bridge" aria-label="FixMap checks the sample project">
          <span>2. FixMap checks the sample project</span>
          <ArrowRight size={22} weight="bold" aria-hidden />
        </div>

        <section className="real-report-output" aria-label="Output from FixMap">
          <span className="real-report-label">3. FixMap shows</span>
          <strong>{editCandidate ? "Where to start" : "FixMap needs more detail"}</strong>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{status}</p>

          {editCandidate ? (
            <>
              <dl>
                <div>
                  <dt><FileText size={19} weight="duotone" aria-hidden /> File to check first</dt>
                  <dd>
                    <code>{editCandidate.path}</code>
                    {editCandidateReason ? <span>{editCandidateReason}</span> : null}
                  </dd>
                </div>
                <div>
                  <dt><CheckCircle size={19} weight="fill" aria-hidden /> Test to run</dt>
                  <dd>
                    <code>{testRoute?.command ?? "No test route surfaced"}</code>
                    {testRoute ? (
                      <span>
                        {testRoute.reason}
                        {testRoute.relatedFiles[0] ? ` · Nearest test: ${testRoute.relatedFiles[0]}` : ""}
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt><GitBranch size={19} weight="duotone" aria-hidden /> Other code to review</dt>
                  <dd>
                    <code>{impactFile?.path ?? "No nearby impact file surfaced"}</code>
                    {impactReason ? <span>{impactReason}</span> : null}
                    {risk ? (
                      <span className="real-report-risk">
                        <Warning size={14} aria-hidden /><b>Area to review: {risk.area}</b> · {risk.reason}
                      </span>
                    ) : null}
                  </dd>
                </div>
              </dl>
              {diagnostic ? (
                <p className="real-report-diagnostic">
                  <Warning size={15} aria-hidden />
                  <span><b>FixMap says:</b> {diagnostic.message}</span>
                </p>
              ) : null}
            </>
          ) : (
            <div className="real-report-empty">
              <Warning size={22} weight="duotone" aria-hidden />
              <div>
                <strong>FixMap does not have enough detail to choose a file.</strong>
                {diagnostic ? <p>FixMap says: {diagnostic.message}</p> : null}
                {report.analysis?.nextAction ? <small>{report.analysis.nextAction}</small> : null}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="real-report-footnote">
        <span>This box uses a small sample project. It does not read your project, and nothing you type is uploaded.</span>
        <Link href="/get-started">Use it on my project <ArrowRight size={14} weight="bold" aria-hidden /></Link>
      </div>
    </figure>
  );
}
