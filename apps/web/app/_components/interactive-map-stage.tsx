"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  CaretDown,
  CheckCircle,
  FileText,
  ShieldCheck,
  Warning
} from "@phosphor-icons/react";

type StageKey = "files" | "checks" | "risks";

type Example = {
  label: string;
  issue: string;
  files: [string, string, string];
  checks: [string, string, string];
  risks: [string, string, string];
};

const examples: Example[] = [
  {
    label: "Expiring reset links",
    issue: "Password reset links expire too early",
    files: ["src/features/auth/reset/request.ts", "src/features/auth/reset/token-service.ts", "src/lib/email/templates/reset.ts"],
    checks: ["Token expiration logic", "Reset token integration tests", "Email link TTL configuration"],
    risks: ["Clock and timezone boundary", "Cached authentication config", "Email client link prefetch"]
  },
  {
    label: "Wrong invoice time zone",
    issue: "Invoices show the wrong time after daylight saving changes",
    files: ["src/timezone/resolve.ts", "src/invoices/summary.ts", "src/timezone/index.ts"],
    checks: ["Timezone conversion tests", "DST boundary cases", "Invoice rendering path"],
    risks: ["Cached timezone offsets", "External API assumptions", "Off-by-one date handling"]
  },
  {
    label: "Duplicate webhook event",
    issue: "Payment webhooks sometimes create duplicate orders",
    files: ["src/payments/webhook.ts", "src/orders/create-order.ts", "src/payments/idempotency.ts"],
    checks: ["Webhook replay test", "Order idempotency suite", "Concurrent insert handling"],
    risks: ["Retry timing window", "Missing unique constraint", "Out-of-order delivery"]
  }
];

const firstExample = examples[0]!;

const stageMeta: Array<{ key: StageKey; label: string; hint: string }> = [
  { key: "files", label: "Files", hint: "Finding relevant code" },
  { key: "checks", label: "Checks", hint: "Building validations" },
  { key: "risks", label: "Risks", hint: "Assessing impact" }
];

function OutputCard({
  stage,
  active,
  ready,
  items,
  onSelect
}: {
  stage: StageKey;
  active: boolean;
  ready: boolean;
  items: [string, string, string];
  onSelect: () => void;
}) {
  const config = {
    files: { icon: FileText, title: "Files to inspect", count: "7 files", metric: "Confidence", value: "High" },
    checks: { icon: CheckCircle, title: "Checks to run", count: "8 checks", metric: "Confidence", value: "High" },
    risks: { icon: Warning, title: "Risks to review", count: "6 risks", metric: "Impact", value: "Medium" }
  }[stage];
  const Icon = config.icon;

  return (
    <button
      className={`stage-output-card ${active ? "active" : ""} ${ready ? "ready" : "pending"}`}
      type="button"
      onClick={onSelect}
      aria-pressed={active}
    >
      <span className="stage-card-heading">
        <Icon size={22} weight={stage === "checks" ? "fill" : "regular"} aria-hidden />
        <strong>{config.title}</strong>
        <small>{ready ? config.count : "Analyzing"}</small>
        <span className="stage-card-metric"><small>{config.metric}</small><b>{ready ? config.value : "—"}</b></span>
      </span>
      <span className="stage-card-rows">
        {items.map((item, index) => (
          <span key={item} style={{ "--row-index": index } as CSSProperties}>
            <b>{index + 1}</b><code>{ready ? item : "Scanning repository signals…"}</code><small>{stage === "files" ? (index === 0 ? "Exact match" : "High signal") : stage === "checks" ? "Evidence" : "Why"}</small>
          </span>
        ))}
      </span>
      <span className="stage-card-more">+{stage === "files" ? 4 : 5} more <ArrowRight size={14} weight="bold" aria-hidden /></span>
    </button>
  );
}

export function InteractiveMapStage() {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [issue, setIssue] = useState(firstExample.issue);
  const [activeStage, setActiveStage] = useState<StageKey>("files");
  const [readyCount, setReadyCount] = useState(3);
  const [isRunning, setIsRunning] = useState(false);
  const timers = useRef<number[]>([]);
  const example = examples[exampleIndex] ?? firstExample;

  const clearTimers = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  };

  useEffect(() => clearTimers, []);

  const stageItems = useMemo(
    () => ({ files: example.files, checks: example.checks, risks: example.risks }),
    [example]
  );

  const runMap = () => {
    clearTimers();
    setIsRunning(true);
    setReadyCount(0);
    setActiveStage("files");
    timers.current = [
      window.setTimeout(() => setReadyCount(1), 420),
      window.setTimeout(() => { setReadyCount(2); setActiveStage("checks"); }, 980),
      window.setTimeout(() => { setReadyCount(3); setActiveStage("risks"); }, 1540),
      window.setTimeout(() => setIsRunning(false), 1880)
    ];
  };

  const chooseExample = (index: number) => {
    const nextExample = examples[index];
    if (!nextExample) return;
    clearTimers();
    setExampleIndex(index);
    setIssue(nextExample.issue);
    setReadyCount(3);
    setActiveStage("files");
    setIsRunning(false);
  };

  return (
    <div className="interactive-map-stage" aria-label="Interactive example of a FixMap report">
      <div className="stage-toolbar">
        <span className="stage-mini-brand"><ShieldCheck size={19} weight="duotone" aria-hidden /><b>FixMap</b></span>
        <label className="stage-example-select">
          <span className="sr-only">Choose an example issue</span>
          <select value={exampleIndex} onChange={(event) => chooseExample(Number(event.target.value))}>
            {examples.map((item, index) => <option value={index} key={item.label}>Example: {item.label}</option>)}
          </select>
          <CaretDown size={14} weight="bold" aria-hidden />
        </label>
        <span className="stage-local-status"><i /> Local analysis</span>
      </div>

      <div className="stage-body">
        <div className="stage-input-column">
          <div className="stage-input-heading"><span>1</span><strong>Describe the issue<br />in plain English</strong></div>
          <div className="stage-issue-field">
            <label className="sr-only" htmlFor="fixmap-hero-issue">Software issue</label>
            <textarea id="fixmap-hero-issue" value={issue} maxLength={500} onChange={(event) => setIssue(event.target.value)} />
            <span>{issue.length}/500</span>
            <button type="button" onClick={runMap} aria-label="Create a FixMap report" disabled={isRunning || issue.trim().length < 8}>
              <ArrowRight size={19} weight="bold" aria-hidden />
            </button>
          </div>
          <div className="stage-trust-note"><ShieldCheck size={19} weight="duotone" aria-hidden /><span><strong>Starting map, not proof.</strong>Review results before making changes.</span></div>
        </div>

        <div className="stage-output-column">
          <div className="stage-progress" aria-label="Analysis progress">
            {stageMeta.map((stage, index) => {
              const isReady = readyCount > index;
              return (
                <button key={stage.key} type="button" className={`${activeStage === stage.key ? "active" : ""} ${isReady ? "ready" : ""}`} onClick={() => setActiveStage(stage.key)}>
                  <span>{index + 1}</span><strong>{stage.label}</strong><small>{isReady ? "Ready" : stage.hint}</small>
                </button>
              );
            })}
          </div>
          <div className="stage-output-stack" aria-live="polite">
            {stageMeta.map((stage, index) => (
              <OutputCard
                key={stage.key}
                stage={stage.key}
                active={activeStage === stage.key}
                ready={readyCount > index}
                items={stageItems[stage.key]}
                onSelect={() => setActiveStage(stage.key)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
