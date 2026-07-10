"use client";

import { useMemo, useState } from "react";

const files = [
  { path: "src/auth/reset-password.ts", text: "password reset token email authentication", kind: "code" },
  { path: "src/auth/session.ts", text: "login session cookie authentication", kind: "code" },
  { path: "src/billing/create-invoice.ts", text: "billing payment invoice customer", kind: "code" },
  { path: "src/email/send-reset.ts", text: "send password reset email template", kind: "code" },
  { path: "test/auth/reset-password.test.ts", text: "password reset email token test", kind: "test" },
  { path: ".github/workflows/ci.yml", text: "workflow test build pull request", kind: "config" },
  { path: "README.md", text: "installation guide documentation", kind: "documentation" }
] as const;

const presets = [
  "Password reset emails fail",
  "Invoices are created twice",
  "Login sessions expire too early",
  "Update the installation guide"
];

function tokens(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).map((token) => {
    if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
    if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -1);
    if (token.length > 4 && token.endsWith("es")) return token.slice(0, -1);
    if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
    return token;
  }).filter((token) => token.length > 2));
}

export function Demo() {
  const [task, setTask] = useState<string>("Password reset emails fail");
  const ranked = useMemo(() => {
    const taskTokens = tokens(task);
    return files
      .map((file) => {
        const pathTokens = tokens(file.path);
        const contentTokens = tokens(file.text);
        const pathMatches = [...pathTokens].filter((token) => taskTokens.has(token));
        const contentMatches = [...contentTokens].filter((token) => taskTokens.has(token));
        const score = pathMatches.length * 3 + contentMatches.length * 2 + (file.kind === "code" ? 2 : 0);
        return { ...file, score, matches: [...new Set([...pathMatches, ...contentMatches])] };
      })
      .filter((file) => file.score > 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
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
        <div className="privacy-note"><span>◌</span><p><strong>Sample data only.</strong> Nothing typed here leaves your browser.</p></div>
      </div>
      <div className="demo-results" aria-live="polite">
        <div className="results-head"><span>Context pack</span><small>{ranked.length} files</small></div>
        {ranked.length ? ranked.map((file, index) => (
          <article className="result" key={file.path}>
            <span className="result-number">{String(index + 1).padStart(2, "0")}</span>
            <div><code>{file.path}</code><p>{file.matches.length ? `Matches: ${file.matches.join(", ")}` : "Repository structure signal"}</p></div>
            <span className={`confidence ${file.score >= 10 ? "high" : file.score >= 6 ? "medium" : "low"}`}>{file.score >= 10 ? "high" : file.score >= 6 ? "medium" : "low"}</span>
          </article>
        )) : <div className="empty-result"><strong>No confident match yet.</strong><p>Try mentioning a feature, file, or behavior.</p></div>}
        <div className="route-preview"><span>Suggested check</span><code>{task.toLowerCase().includes("guide") ? "No code test required" : "npm run test"}</code></div>
      </div>
    </div>
  );
}
