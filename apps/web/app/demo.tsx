"use client";

import { useMemo, useState } from "react";
import { buildReportFromRepo, explainFile, verifyPlan } from "@aryam/fixmap-core/browser";
import { sampleRepo, sampleRepoWithChanges, samplePaths } from "./sample-repo";

type Stage = "plan" | "explain" | "verify";

const presets = [
  {
    label: "Password reset emails never arrive",
    note: "A symptom with no symbol. This is where a lexical ranker is weakest — watch what happens in the next preset."
  },
  {
    label: "sendMail throws and password reset emails never arrive",
    note: "The same bug with one symbol named. The transport rises into the top three, and its reason says why: it defines sendMail."
  },
  {
    label: "TOKEN_TTL_MINUTES is ignored, reset links expire immediately",
    note: "A named constant is the strongest anchor there is. The file that defines it wins outright."
  },
  {
    label: "Invoices are created twice for the same customer",
    note: "A different subsystem, no overlap with the auth files, no drift into them."
  },
  {
    label: "make it better",
    note: "No searchable anchor. FixMap reports nothing and says so, instead of ranking something plausible."
  }
];

const scenarios = [
  { label: "Edited the build output", changed: ["dist/auth/reset-password.js"] },
  { label: "Shipped with no test", changed: ["src/email/transport.ts"] },
  { label: "Also touched billing", changed: ["src/email/transport.ts", "src/billing/invoice.ts"] },
  {
    label: "Source and test together",
    changed: ["src/auth/reset-password.ts", "test/auth/reset-password.test.ts"]
  }
];

const explainTargets = samplePaths;

export function Demo() {
  const [task, setTask] = useState(presets[0]!.label);
  const [stage, setStage] = useState<Stage>("plan");
  const [explainTarget, setExplainTarget] = useState("dist/auth/reset-password.js");
  const [scenario, setScenario] = useState(0);

  const report = useMemo(() => buildReportFromRepo(sampleRepo, { issueText: task }), [task]);
  const explanation = useMemo(
    () => explainFile(sampleRepo, { issueText: task }, explainTarget),
    [task, explainTarget]
  );
  const verification = useMemo(
    () => verifyPlan(report, sampleRepoWithChanges(scenarios[scenario]!.changed)),
    [report, scenario]
  );

  const activePreset = presets.find((preset) => preset.label === task);
  const command = {
    plan: `fixmap plan --issue "${truncate(task)}"`,
    explain: `fixmap plan --issue "${truncate(task)}" --explain ${explainTarget}`,
    verify: `fixmap verify --report plan.json --diff main...HEAD`
  }[stage];

  return (
    <div className="workbench">
      <div className="stage-tabs" role="tablist" aria-label="FixMap stages">
        {(
          [
            ["plan", "1 · Plan", "Where do I start?"],
            ["explain", "2 · Ask why", "Why not this file?"],
            ["verify", "3 · Verify", "Did the change match?"]
          ] as const
        ).map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={stage === value}
            className={stage === value ? "stage-tab active" : "stage-tab"}
            onClick={() => setStage(value)}
          >
            <b>{label}</b>
            <small>{hint}</small>
          </button>
        ))}
      </div>

      <div className="demo-shell">
        <div className="demo-input">
          <label htmlFor="task">The task</label>
          <textarea id="task" value={task} onChange={(event) => setTask(event.target.value)} rows={3} />
          <div className="preset-list" aria-label="Example tasks">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                aria-pressed={task === preset.label}
                onClick={() => setTask(preset.label)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {activePreset ? <p className="preset-note">{activePreset.note}</p> : null}

          <p className="demo-command">
            <span>Same result from the CLI</span>
            <code>{command}</code>
          </p>

          <div className="privacy-note">
            <span>●</span>
            <p>
              <strong>This is FixMap itself, not a mockup.</strong> The page imports the same
              ranking, explanation, and verification code the CLI runs, and executes it on a
              sample repository in your browser. Nothing you type is sent anywhere.
            </p>
          </div>
        </div>

        <div className="demo-results" aria-live="polite">
          {stage === "plan" ? <PlanPanel report={report} /> : null}
          {stage === "explain" ? (
            <ExplainPanel
              explanation={explanation}
              target={explainTarget}
              onTargetChange={setExplainTarget}
            />
          ) : null}
          {stage === "verify" ? (
            <VerifyPanel
              verification={verification}
              scenario={scenario}
              onScenarioChange={setScenario}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PlanPanel({ report }: { report: ReturnType<typeof buildReportFromRepo> }) {
  return (
    <>
      <div className="results-head">
        <span>Context files</span>
        <small>{report.contextFiles.length} ranked</small>
      </div>

      {report.contextFiles.length > 0 ? (
        report.contextFiles.map((file, index) => (
          <article className="result" key={file.path}>
            <span className="result-number">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <code>{file.path}</code>
              <p>{file.reasons.join("; ")}</p>
            </div>
            <span className={`confidence ${file.confidence}`}>
              {file.confidence} · {file.score}
            </span>
          </article>
        ))
      ) : (
        <div className="empty-result">
          <strong>Nothing ranked.</strong>
          <p>FixMap returns an empty report rather than a plausible guess.</p>
        </div>
      )}

      {report.testRoutes.length > 0 ? (
        <div className="route-preview">
          <span>Run this</span>
          <code>{report.testRoutes[0]!.command}</code>
        </div>
      ) : null}
      {report.testRoutes[0]?.relatedFiles.length ? (
        <p className="route-related">
          Nearest test: <code>{report.testRoutes[0]!.relatedFiles[0]}</code>
        </p>
      ) : null}

      {report.risks.length > 0 ? (
        <div className="panel-block">
          <h4>Risk</h4>
          {report.risks.map((risk) => (
            <p key={risk.area}>
              <span className={`severity ${risk.severity}`}>{risk.severity}</span>
              {risk.area} — {risk.reason}
            </p>
          ))}
        </div>
      ) : null}

      {report.diagnostics.length > 0 ? (
        <div className="panel-block">
          <h4>Diagnostics</h4>
          {report.diagnostics.map((diagnostic) => (
            <p key={diagnostic.code}>
              <span className={`severity ${diagnostic.severity}`}>{diagnostic.severity}</span>
              {diagnostic.message}
            </p>
          ))}
        </div>
      ) : null}

      {report.analysis ? <p className="next-action">→ {report.analysis.nextAction}</p> : null}
    </>
  );
}

function ExplainPanel({
  explanation,
  target,
  onTargetChange
}: {
  explanation: ReturnType<typeof explainFile>;
  target: string;
  onTargetChange: (path: string) => void;
}) {
  return (
    <>
      <div className="results-head">
        <span>Why this file</span>
        <small className={`status-${explanation.status}`}>{explanation.status.replace("-", " ")}</small>
      </div>

      <label className="picker-label" htmlFor="explain-target">
        Pick any file in the sample repository
      </label>
      <select
        id="explain-target"
        className="picker"
        value={target}
        onChange={(event) => onTargetChange(event.target.value)}
      >
        {explainTargets.map((path) => (
          <option key={path} value={path}>
            {path}
          </option>
        ))}
      </select>

      <p className="explain-summary">{explanation.summary}</p>

      {explanation.reasons.length > 0 ? (
        <div className="panel-block">
          <h4>Scored for</h4>
          {explanation.reasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
      ) : null}

      <p className="panel-footnote">
        A ranked list explains what it chose. This answers the question it cannot: why the file
        you expected is missing. The four answers are genuinely different — it ranked lower than
        you thought, it scored below the cutoff, it was excluded on purpose, or the scan never
        saw it.
      </p>
    </>
  );
}

function VerifyPanel({
  verification,
  scenario,
  onScenarioChange
}: {
  verification: ReturnType<typeof verifyPlan>;
  scenario: number;
  onScenarioChange: (index: number) => void;
}) {
  const hasError = verification.findings.some((finding) => finding.severity === "error");

  return (
    <>
      <div className="results-head">
        <span>Plan vs. diff</span>
        <small className={hasError ? "status-excluded" : "status-ranked"}>
          exit {hasError ? 1 : 0}
        </small>
      </div>

      <p className="picker-label" id="scenario-label">
        Pretend the change touched
      </p>
      <div className="preset-list" id="scenario" role="group" aria-labelledby="scenario-label">
        {scenarios.map((option, index) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={scenario === index}
            onClick={() => onScenarioChange(index)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="changed-list">
        {scenarios[scenario]!.changed.map((path) => (
          <code key={path}>{path}</code>
        ))}
      </p>

      <p className="explain-summary">{verification.summary}</p>

      {verification.findings.map((finding) => (
        <article className="finding" key={finding.code}>
          <span className={`severity ${finding.severity}`}>{finding.severity}</span>
          <div>
            <p>{finding.message}</p>
            {finding.paths.map((path) => (
              <code key={path}>{path}</code>
            ))}
          </div>
        </article>
      ))}

      <p className="panel-footnote">
        Only the discarded edit exits non-zero, because that one is wrong whatever the task was.
        Everything else is advisory: a plan can be wrong and a change can still be right, so
        FixMap reports the gap rather than judging it.
      </p>
    </>
  );
}

function truncate(task: string): string {
  return task.length <= 46 ? task : `${task.slice(0, 43)}...`;
}
