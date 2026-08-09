import { ArrowRight, CheckCircle, FileText, Warning } from "@phosphor-icons/react/ssr";
import { buildReportFromRepo } from "@aryam/fixmap-core/browser";
import { sampleRepo } from "../sample-repo";

const task = "TOKEN_TTL_MINUTES is ignored and reset links expire immediately.";
const report = buildReportFromRepo(sampleRepo, { issueText: task, limit: 3 });

const outputs = [
  {
    icon: FileText,
    title: "Files to inspect",
    items: report.contextFiles.map((file) => `${file.path} · ${file.confidence}, score ${file.score}`)
  },
  {
    icon: CheckCircle,
    title: "Checks to run",
    items: report.testRoutes.map((route) => route.command)
  },
  {
    icon: Warning,
    title: "Risks to review",
    items: report.risks.map((risk) => `${risk.severity} ${risk.area} · ${risk.reason}`)
  }
];

export function ProductMap({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "product-map compact" : "product-map"} role="group" aria-label="How FixMap turns a problem into a focused map">
      <div className="map-step map-input">
        <span className="step-number">1</span>
        <div>
          <strong>You describe the issue</strong>
          <span>in plain English</span>
        </div>
        <p>{task}</p>
      </div>
      <ArrowRight className="map-arrow" size={30} weight="bold" aria-hidden />
      <div className="map-output">
        <div className="map-output-heading">
          <span className="step-number">2</span>
          <strong>FixMap finds the few places most likely to matter</strong>
        </div>
        <div className="map-output-list">
          {outputs.map(({ icon: Icon, title, items }) => (
            <article key={title}>
              <Icon size={23} aria-hidden />
              <div>
                <h2>{title}</h2>
                {items.map((item, index) => <p key={item}><span>{index + 1}</span>{item}</p>)}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
