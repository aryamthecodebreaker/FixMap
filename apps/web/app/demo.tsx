"use client";

import { useMemo, useState } from "react";
import { buildTestRoutes, rankContextFiles, type RepoFile, type RepoMap } from "@aryam/fixmap-core/browser";

const sampleFiles = [
  sampleFile("src/auth/reset-password.ts", "password reset token email authentication", "code"),
  sampleFile("src/auth/session.ts", "login session cookie authentication", "code"),
  sampleFile("src/billing/create-invoice.ts", "billing payment invoice customer", "code"),
  sampleFile("src/email/send-reset.ts", "send password reset email template", "code"),
  sampleFile("test/auth/reset-password.test.ts", "password reset email token test", "code", true),
  sampleFile(".github/workflows/ci.yml", "workflow test build pull request", "config"),
  sampleFile("README.md", "installation guide documentation", "documentation")
];

const sampleRepo: RepoMap = {
  root: "sample-repository",
  files: sampleFiles,
  packageScripts: [{ name: "test", command: "vitest run", packageDir: "" }],
  changedFiles: [],
  diffText: "",
  packageManager: "npm",
  diagnostics: []
};

const presets = [
  "Password reset emails fail",
  "Invoices are created twice",
  "Login sessions expire too early",
  "Update the installation guide"
];

export function Demo() {
  const [task, setTask] = useState<string>("Password reset emails fail");
  const result = useMemo(() => {
    const ranked = rankContextFiles(sampleRepo, { issueText: task }, 4);
    const routes = buildTestRoutes(sampleRepo, ranked.map((file) => file.path));
    return { ranked, routes };
  }, [task]);

  return (
    <div className="demo-shell">
      <div className="demo-input">
        <label htmlFor="task">Describe the task</label>
        <textarea id="task" value={task} onChange={(event) => setTask(event.target.value)} rows={4} />
        <div className="preset-list" aria-label="Example tasks">
          {presets.map((preset) => (
            <button key={preset} type="button" aria-pressed={task === preset} onClick={() => setTask(preset)}>{preset}</button>
          ))}
        </div>
        <div className="privacy-note"><span>●</span><p><strong>Sample data only.</strong> Nothing typed here leaves your browser.</p></div>
      </div>
      <div className="demo-results" aria-live="polite">
        <div className="results-head"><span>Context pack</span><small>{result.ranked.length} files</small></div>
        {result.ranked.length ? result.ranked.map((file, index) => (
          <article className="result" key={file.path}>
            <span className="result-number">{String(index + 1).padStart(2, "0")}</span>
            <div><code>{file.path}</code><p>{file.reasons.join("; ")}</p></div>
            <span className={`confidence ${file.confidence}`}>{file.confidence}</span>
          </article>
        )) : <div className="empty-result"><strong>No confident match yet.</strong><p>Try mentioning a feature, file, or behavior.</p></div>}
        <div className="route-preview">
          <span>Suggested check</span>
          <code>{result.routes[0]?.command ?? "No code test required"}</code>
        </div>
      </div>
    </div>
  );
}

function sampleFile(
  path: string,
  textSample: string,
  kind: RepoFile["kind"],
  isTest = false
): RepoFile {
  const extensionIndex = path.lastIndexOf(".");
  return {
    path,
    extension: extensionIndex >= 0 ? path.slice(extensionIndex) : "",
    sizeBytes: textSample.length,
    isTest,
    isSource: true,
    kind,
    textSample
  };
}
