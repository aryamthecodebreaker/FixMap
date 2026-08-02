"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildPathExcluder, buildReportFromRepo, compareReports, explainFile, verifyPlan } from "@aryam/fixmap-core/browser";
import { sampleRepo, sampleRepoWithChanges, samplePaths } from "./sample-repo";

type Stage = "plan" | "explain" | "compare" | "verify";

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
  const [limit, setLimit] = useState(8);
  const [excludeBuild, setExcludeBuild] = useState(false);
  const [workingTree, setWorkingTree] = useState(false);

  // The wording the previous plan ran with, so Compare answers the question its stage asks —
  // "did refining the task move the real file?" — rather than always diffing against the
  // first preset. `settled` tracks the last wording that stopped changing, and only a genuine
  // edit promotes it to the baseline, so the delta survives instead of collapsing to empty as
  // soon as typing stops. The ref is read inside the effect, never during render.
  const [baselineTask, setBaselineTask] = useState(presets[0]!.label);
  const settled = useRef(presets[0]!.label);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (task !== settled.current) {
        setBaselineTask(settled.current);
        settled.current = task;
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [task]);

  const exclude = useMemo(() => buildPathExcluder(excludeBuild ? ["dist/**"] : []), [excludeBuild]);
  const activeRepo = useMemo(() => workingTree ? sampleRepoWithChanges(scenarios[scenario]!.changed) : sampleRepo, [workingTree, scenario]);
  const report = useMemo(() => buildReportFromRepo(activeRepo, { issueText: task, limit, exclude }), [activeRepo, task, limit, exclude]);
  // Built on the same repository as the current plan. Diffing a clean-tree baseline against a
  // working-tree plan moved two variables at once and labeled the result a task refinement.
  const baseline = useMemo(
    () => buildReportFromRepo(activeRepo, { issueText: baselineTask, limit, exclude }),
    [activeRepo, baselineTask, limit, exclude]
  );
  const comparison = useMemo(() => compareReports(baseline, report), [baseline, report]);
  // Explain re-ranks, so it has to see the tree the plan saw or it explains a ranking that
  // was never on screen.
  const explanation = useMemo(
    () => explainFile(activeRepo, { issueText: task, limit, exclude }, explainTarget),
    [activeRepo, task, limit, exclude, explainTarget]
  );
  // Verify compares a plan against what changed after it. Injecting scenario changes while
  // the plan was built on a clean tree let verify contradict the plan beside it.
  const verifyRepo = useMemo(
    () => workingTree ? activeRepo : sampleRepoWithChanges(scenarios[scenario]!.changed),
    [workingTree, activeRepo, scenario]
  );
  const verification = useMemo(() => verifyPlan(report, verifyRepo), [report, verifyRepo]);

  const activePreset = presets.find((preset) => preset.label === task);
  // Every control on screen has to appear here, or the command someone copies produces a
  // different ranking from the one they are looking at — which is the one thing a live demo
  // must not do.
  const scanFlags =
    `${limit === 8 ? "" : ` --limit ${limit}`}` +
    `${excludeBuild ? ' --exclude "dist/**"' : ""}` +
    `${workingTree ? " --working-tree" : ""}`;
  const command = {
    plan: `fixmap plan --issue "${truncate(task)}"${scanFlags}`,
    explain: `fixmap plan --issue "${truncate(task)}" --explain ${explainTarget}${scanFlags}`,
    compare: `fixmap plan --issue "${truncate(task)}" --compare before.json${scanFlags}`,
    verify: `fixmap verify --report plan.json ${workingTree ? "--working-tree" : "--diff main...HEAD"}`
  }[stage];

  return (
    <div className="workbench">
      <div className="stage-tabs" role="tablist" aria-label="FixMap stages">
        {(
          [
            ["plan", "1 · Plan", "Where do I start?"],
            ["explain", "2 · Ask why", "Why not this file?"],
            ["compare", "3 · Compare", "Did better context move?"],
            ["verify", "4 · Verify", "Did the change match?"]
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

          <label className="picker-label" htmlFor="context-limit">Context limit: {limit}</label>
          <input id="context-limit" type="range" min="1" max="8" value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
          <label className="picker-label"><input type="checkbox" checked={excludeBuild} onChange={(event) => setExcludeBuild(event.target.checked)} /> Exclude generated <code>dist/**</code></label>
          <label className="picker-label"><input type="checkbox" checked={workingTree} onChange={(event) => setWorkingTree(event.target.checked)} /> Include the selected scenario as a working-tree change set</label>

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
          {stage === "compare" ? <ComparePanel comparison={comparison} /> : null}
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

function ComparePanel({ comparison }: { comparison: ReturnType<typeof compareReports> }) {
  const changes = [...comparison.entered, ...comparison.moved, ...comparison.confidenceChanged];
  return (
    <>
      <div className="results-head"><span>Earlier plan vs. current task</span><small>{changes.length} changed</small></div>
      <p className="explain-summary">{comparison.summary}</p>
      {changes.map((delta) => (
        <article className="finding" key={`${delta.status}-${delta.path}`}>
          <span className="severity info">{delta.status}</span>
          <div><code>{delta.path}</code><p>rank {delta.previousRank ?? "—"} → {delta.currentRank ?? "—"}; score {delta.previousScore ?? "—"} → {delta.currentScore ?? "—"}</p></div>
        </article>
      ))}
      <p className="panel-footnote">Compare makes task refinement measurable: save a JSON plan, add the missing symbol or path, and confirm the real fix site rises.</p>
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
