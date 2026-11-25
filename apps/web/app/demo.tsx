"use client";

import { ArrowsClockwise, ChatCircleText, CheckCircle, Flask, Question, Warning } from "@phosphor-icons/react";
import { useDeferredValue, useMemo, useState } from "react";
import { Mark } from "./_components/logo";
import { buildHomepageReport, homepageDefaultTask, homepagePresets, selectHomepageEvidence } from "./_lib/homepage-demo";
import { sampleRepo } from "./sample-repo";

const KEYWORDS = new Set(["import", "from", "export", "const", "let", "async", "await", "function", "return", "if", "else", "new", "throw", "type", "interface", "class", "extends", "for", "of", "in", "true", "false", "null", "undefined"]);

/** A small, safe highlighter for the sample's TypeScript: keywords, strings, numbers, comments. */
function highlight(line: string) {
  const parts: Array<{ text: string; kind?: string }> = [];
  const pattern = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d_]*\b)|(\b[A-Za-z_]\w*\b)/g;
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: line.slice(last, index) });
    const [text] = match;
    if (match[1]) parts.push({ text, kind: "tok-com" });
    else if (match[2]) parts.push({ text, kind: "tok-str" });
    else if (match[3]) parts.push({ text, kind: "tok-num" });
    else parts.push(KEYWORDS.has(text) ? { text, kind: "tok-kw" } : { text });
    last = index + text.length;
  }
  if (last < line.length) parts.push({ text: line.slice(last) });
  return parts.map((part, index) => (part.kind ? <span key={index} className={part.kind}>{part.text}</span> : part.text));
}

/** The line FixMap's reason points at: a named identifier's definition, else the first line using a task word. */
function hitLine(lines: string[], reasons: string[], task: string): number {
  const named = reasons
    .flatMap((reason) => /(?:identifiers?|symbols?)[^:]*:\s*(.+)$/i.exec(reason)?.[1]?.split(/,\s*/) ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  for (const name of named) {
    const definition = lines.findIndex((line) => new RegExp(`\\b(?:const|let|function|class|type|interface)\\s+${name}\\b`).test(line));
    if (definition >= 0) return definition;
    const use = lines.findIndex((line) => line.includes(name));
    if (use >= 0) return use;
  }
  const words = task.toLowerCase().split(/[^a-z0-9_]+/).filter((word) => word.length > 3);
  const found = lines.findIndex((line) => words.some((word) => line.toLowerCase().includes(word)));
  return found >= 0 ? found : 0;
}

/** One plain sentence from FixMap's strongest reason: a definition beats a mention beats a path match. */
function startHere(reasons: string[]): string {
  const value = (prefix: RegExp) => reasons.map((reason) => prefix.exec(reason)?.[1]).find(Boolean);
  const defines = value(/^defines task identifiers: (.+)$/);
  if (defines) return `Start here: this file defines ${defines}, which your task names.`;
  const symbols = value(/^defines symbols matching task terms: (.+)$/);
  if (symbols) return `Start here: this file defines ${symbols}, which matches your task.`;
  const mentions = value(/^content matches task terms: (.+)$/);
  const path = value(/^path matches task terms: (.+)$/);
  if (mentions && path) return `Start here: its name matches ${path}, and the code mentions ${mentions}.`;
  if (mentions) return `Start here: the code mentions ${mentions}.`;
  if (path) return `Start here: its name matches ${path}.`;
  return "Start here: this is the strongest match for your task.";
}

/** Website demo where visitors describe an issue and inspect the top-ranked file. */
export function Review() {
  const [task, setTask] = useState<string>(homepageDefaultTask);
  const deferredTask = useDeferredValue(task);
  const report = useMemo(() => buildHomepageReport(deferredTask), [deferredTask]);
  const evidence = useMemo(() => selectHomepageEvidence(report), [report]);
  const top = evidence.editCandidate;
  const file = top ? sampleRepo.files.find((entry) => entry.path === top.path) : undefined;
  const lines = file ? file.textSample.replace(/\n$/, "").split("\n") : [];
  const hit = top && file ? hitLine(lines, top.reasons, deferredTask) : 0;
  const start = Math.max(0, hit - 4);
  const excerpt = lines.slice(start, Math.min(lines.length, hit + 5));
  const test = evidence.testRoute;
  const nearestTest = test?.relatedFiles?.[0];
  const impact = evidence.impactFile;
  const risk = evidence.risk;
  const pending = deferredTask !== task;

  return (
    <div className="timeline">
      <article className="event" aria-labelledby="task-heading">
        <div className="avatar" aria-hidden>Y</div>
        <div className="comment">
          <div className="comment-head">
            <strong id="task-heading">You</strong>
            <span>describe what is broken</span>
            <span className="badge">sample project</span>
          </div>
          <div className="comment-body task-form">
            <label htmlFor="task">Task for FixMap</label>
            <textarea id="task" value={task} onChange={(event) => setTask(event.target.value)} spellCheck={false} />
            <div className="presets" role="group" aria-label="Example tasks">
              {homepagePresets.map((preset) => (
                <button key={preset.label} type="button" className="preset" aria-pressed={task === preset.task} onClick={() => setTask(preset.task)}>
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </article>

      <article className="event" aria-labelledby="review-heading" aria-busy={pending}>
        <div className="avatar bot" aria-hidden><Mark /></div>
        <div className="comment review">
          <div className="comment-head">
            <strong id="review-heading">FixMap</strong>
            <span>reviewed the task against the sample project</span>
            {pending ? <span className="badge"><ArrowsClockwise size={12} aria-hidden />&nbsp;checking</span> : <span className="badge ok">done</span>}
          </div>
          <div className="comment-body" aria-live="polite">
            {top && file ? (
              <>
                <div className="file">
                  <div className="file-head">
                    <span className="rank" aria-label="First">1</span>
                    <span className="path">{top.path}</span>
                    <span className="why">open this first</span>
                  </div>
                  <div className="code" role="group" aria-label={`${top.path}, lines ${start + 1} to ${start + excerpt.length}`}>
                    {excerpt.map((text, offset) => {
                      const number = start + offset + 1;
                      const isHit = start + offset === hit;
                      return (
                        <div key={number}>
                          <div className={`line${isHit ? " hit" : ""}`}>
                            <span className="ln">{number}</span>
                            <span className="sg" aria-hidden>{isHit ? "›" : " "}</span>
                            <code>{highlight(text)}</code>
                          </div>
                          {isHit ? (
                            <div className="thread" key={`${deferredTask}-${number}`}>
                              <div className="thread-head">
                                <span className="mini"><Mark /></span>
                                <strong>FixMap</strong>
                                <span>commented on line {number}</span>
                              </div>
                              <div className="thread-body">
                                {startHere(top.reasons)}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="review-list">
                  {test ? (
                    <div className="review-item">
                      <Flask aria-hidden />
                      <div>
                        <strong>Run <code>{test.command}</code></strong>
                        <p>{nearestTest ? <>Closest test: <code>{nearestTest}</code></> : test.reason}</p>
                      </div>
                    </div>
                  ) : null}
                  {impact ? (
                    <div className="review-item">
                      <ChatCircleText aria-hidden />
                      <div>
                        <strong>Also look at <code>{impact.path}</code></strong>
                        <p>{impact.evidence[0]?.reason ?? "Connected to the first file."}</p>
                      </div>
                    </div>
                  ) : null}
                  {risk ? (
                    <div className="review-item warn">
                      <Warning aria-hidden />
                      <div>
                        <strong>Careful: {risk.area}</strong>
                        <p>{risk.reason}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="empty-review">
                <strong><Question size={18} weight="bold" aria-hidden /> Not sure where to start</strong>
                <p>
                  This task does not name anything FixMap can find in the project, so it suggests nothing rather than guessing.
                  Add a symptom, a function name or an error message.
                </p>
              </div>
            )}
            <p className="privacy">
              <CheckCircle size={14} weight="bold" aria-hidden style={{ display: "inline", verticalAlign: "-2px" }} /> This runs FixMap&apos;s real engine in your browser on a small sample project. Nothing you type leaves this page.
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}
