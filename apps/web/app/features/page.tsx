import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { FIXMAP_FEATURES } from "@aryam/fixmap-core/browser";

const ready = FIXMAP_FEATURES.filter((feature) => !feature.preview);
const preview = FIXMAP_FEATURES.filter((feature) => feature.preview);

export const metadata: Metadata = {
  title: "All features",
  description: `Every FixMap feature and the command that uses it: ${FIXMAP_FEATURES.length} in total, ${ready.length} ready and ${preview.length} in preview.`,
  alternates: { canonical: "/features" },
  openGraph: {
    title: "Every FixMap feature",
    description: `${FIXMAP_FEATURES.length} features, each with the command that uses it.`,
    url: "/features"
  }
};

function FeatureList({ features, label }: { features: typeof FIXMAP_FEATURES; label: string }) {
  return (
    <ol className="feature-list" aria-label={label}>
      {features.map((feature) => (
        <li key={feature.name}>
          <h3>
            {feature.name}
            {feature.preview ? <span className="feature-preview">Preview</span> : null}
          </h3>
          <code>{feature.command}</code>
          <p>{feature.detail}</p>
        </li>
      ))}
    </ol>
  );
}

export default function FeaturesPage() {
  return (
    <main className="features-page page-shell">
      <section className="features-hero">
        <h1>FixMap has {FIXMAP_FEATURES.length} features.</h1>
        <p>
          {ready.length} are ready to use. {preview.length} are previews: they work and are tested, but their
          output and options may change before v0.10.0. This is the same list <code>fixmap features</code> prints.
        </p>
        <div className="features-counts" role="group" aria-label="Feature counts">
          <span><strong>{FIXMAP_FEATURES.length}</strong> total</span>
          <span><strong>{ready.length}</strong> ready</span>
          <span><strong>{preview.length}</strong> preview</span>
        </div>
      </section>

      <section className="features-group" aria-labelledby="features-ready">
        <h2 id="features-ready">Ready to use <span>{ready.length}</span></h2>
        <FeatureList features={ready} label="Ready features" />
      </section>

      <section className="features-group" aria-labelledby="features-preview">
        <h2 id="features-preview">Previews <span>{preview.length}</span></h2>
        <FeatureList features={preview} label="Preview features" />
      </section>

      <p className="features-next">
        <Link className="text-link" href="/get-started">Set up FixMap <ArrowRight size={17} weight="bold" aria-hidden /></Link>
      </p>
    </main>
  );
}
