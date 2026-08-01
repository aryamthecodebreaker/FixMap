import { ArrowRight, CheckCircle, FileText, Warning } from "@phosphor-icons/react/ssr";

const outputs = [
  {
    icon: FileText,
    title: "Files to inspect",
    items: ["src/timezone/resolve.ts", "src/invoices/summary.ts", "src/timezone/index.ts"]
  },
  {
    icon: CheckCircle,
    title: "Checks to run",
    items: ["Timezone conversion tests", "DST boundary cases", "Invoice rendering path"]
  },
  {
    icon: Warning,
    title: "Risks to review",
    items: ["Cached timezone offsets", "External API assumptions", "Off-by-one date handling"]
  }
];

export function ProductMap({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "product-map compact" : "product-map"} aria-label="How FixMap turns a problem into a focused map">
      <div className="map-step map-input">
        <span className="step-number">1</span>
        <div>
          <strong>You describe the issue</strong>
          <span>in plain English</span>
        </div>
        <p>Users sometimes see invoices in the wrong time zone after daylight saving time changes.</p>
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
                <h3>{title}</h3>
                {items.map((item, index) => <p key={item}><span>{index + 1}</span>{item}</p>)}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
