import type { Metadata } from "next";
import {
  ArrowRight,
  ChartLineUp,
  CheckCircle,
  Plus,
  ShieldCheck,
  Sparkle,
  Wrench
} from "@phosphor-icons/react/ssr";
import { repoUrl, siteStats } from "../_lib/site-data";

export const metadata: Metadata = {
  title: "Changelog",
  description: "See what is new, improved, and fixed in every recent FixMap release.",
  alternates: { canonical: "/changelog" },
  openGraph: {
    title: "FixMap changelog",
    description: "What changed in each published FixMap release.",
    url: "/changelog"
  }
};

type ChangeGroup = {
  label: "Added" | "Fixed" | "Improved" | "Security" | "Evidence";
  items: string[];
};

/**
 * Every entry here is a version that is published and installable. There is deliberately no
 * "unreleased" or "coming next" state: an entry describing work that has only landed on main
 * tells a reader a fix is available when `npm install` will not give it to them. That is the
 * defect behind #274 pointed the other way — and it happened here once already, with the
 * vendored-bundle fix listed as shipped while npm still served the version without it.
 */
type Release = {
  /** A published semver version. Never "Unreleased". */
  version: string;
  date: string;
  label?: string;
  summary: string;
  groups: ChangeGroup[];
};

const releases: Release[] = [
  {
    version: "0.8.9",
    date: "August 11, 2026",
    label: "Latest release",
    summary: "A complete reliability sweep across ranking, verification, agent discovery, workflows, evidence, and the public product surface.",
    groups: [
      {
        label: "Added",
        items: [
          "Install /fixmap for supported coding agents and open the complete feature catalog without supplying a task.",
          "Validate saved reports from the CLI and opt into warning-level Verify failures in the CLI or GitHub Action.",
          "Control fresh scans consistently across CLI, MCP, and Action interfaces with visible cache diagnostics."
        ]
      },
      {
        label: "Fixed",
        items: [
          "Ranking, grounding, definitions, file mentions, diffs, Unicode text, workspace routing, exclusions, caching, and cross-language test detection now cover the full reviewed issue set.",
          "Explain, Compare, Verify, Doctor, MCP, remote repositories, and the Action reject malformed or ambiguous state with actionable diagnostics.",
          "GitHub output limits, permissions, API failures, credentials, temporary repositories, and generated metadata are handled defensively."
        ]
      },
      {
        label: "Improved",
        items: [
          "The website now uses a calmer editorial design, clearer product navigation, reliable copy feedback, visibility-safe motion, and complete metadata.",
          "README, npm documentation, slash-command setup, release notes, and the post-release checklist cover every supported workflow."
        ]
      },
      {
        label: "Evidence",
        items: [
          "The release ledger maps 126 GitHub issues plus the complete attached 30-finding review to fixes and verification.",
          "External, held-out, adversarial, baseline, savings, package, generated-output, and 1,000-file scan gates are recorded and reproducible."
        ]
      }
    ]
  },
  {
    version: "0.8.8",
    date: "August 8, 2026",
    summary: "Forty-six issues closed across scan correctness, workflow honesty, the Action, documentation, accessibility, and release proof.",
    groups: [
      {
        label: "Added",
        items: [
          "Exact git-state scan caching accelerates repeated plans and can be bypassed with --no-cache.",
          "JSON reports carry reportVersion 1 and a documented additive compatibility policy.",
          "The website follows the system colour scheme and includes a persistent theme toggle."
        ]
      },
      {
        label: "Fixed",
        items: [
          "Scanner, Explain, Compare, Verify, MCP, CLI, and Action diagnostics now distinguish the real failure state and preserve actionable paths.",
          "Generated counterparts no longer outrank maintained source or become the recommended next action.",
          "The demo workflow, transcript, product illustration, metadata, contrast, focus indicators, and accessibility semantics now match the real product."
        ]
      },
      {
        label: "Evidence",
        items: [
          "Added 23 release-specific self-evaluation cases and an empty-suite guard.",
          "The homepage and evidence page now read the checked-in adversarial record, and CI rejects stale rendered assets."
        ]
      }
    ]
  },
  {
    version: "0.8.7",
    date: "August 2, 2026",
    summary: "Readable vendored dependency bundles stop posing as edit targets.",
    groups: [
      {
        label: "Fixed",
        items: [
          "Pretty-printed vendored dependency bundles with a source-map marker no longer escape generated-output detection or rank as a high-confidence edit target."
        ]
      },
      {
        label: "Evidence",
        items: [
          "Added a dedicated adversarial fixture for readable compiled dependencies while keeping Chalk's real vendored implementation ranked first.",
          "All 420 workspace tests pass; held-out and external accuracy remain unchanged, and the adversarial suite is now 9/9 with zero false-confidence cases."
        ]
      }
    ]
  },
  {
    version: "0.8.6",
    date: "August 2, 2026",
    summary: "Cleaner implementation rankings without hiding legitimate UI or generated-artifact work.",
    groups: [
      {
        label: "Fixed",
        items: [
          "Stylesheets are deprioritized for non-UI implementation tasks, while genuine CSS and layout tasks still rank them normally.",
          "Explicitly named generated artifacts remain visible, but a maintained source twin caps their confidence and explains the source relationship."
        ]
      },
      {
        label: "Evidence",
        items: [
          "Added counterexample coverage for real CSS tasks and tasks that genuinely target a stale generated artifact.",
          "Held-out accuracy remained 7/12 Top-1, 8/12 Top-3, and 9/12 Top-5."
        ]
      }
    ]
  },
  {
    version: "0.8.5",
    date: "August 2, 2026",
    summary: "A proper installation path and a much shorter everyday command.",
    groups: [
      {
        label: "Improved",
        items: [
          "The README and website now lead with a global installation followed by the short fixmap command.",
          "Install guidance now explains when npm may prefer an older project-local binary and why the running version printed by Doctor is authoritative."
        ]
      }
    ]
  },
  {
    version: "0.8.4",
    date: "August 2, 2026",
    summary: "Doctor can identify an exact-version request that started the wrong installation.",
    groups: [
      {
        label: "Fixed",
        items: [
          "fixmap doctor reports both the requested and running versions when a local or ancestor installation shadows an exact npm request.",
          "The clean verification procedure uses an isolated npm prefix and invokes its shim directly on Windows."
        ]
      }
    ]
  },
  {
    version: "0.8.3",
    date: "August 2, 2026",
    summary: "Stricter MCP comparison inputs, with honest failures instead of false success.",
    groups: [
      {
        label: "Fixed",
        items: [
          "fixmap_compare rejects truncated report-shaped objects while continuing to accept complete reports that legitimately contain zero matches.",
          "Optional rank, score, and confidence fields are type-checked when present."
        ]
      }
    ]
  },
  {
    version: "0.8.2",
    date: "August 2, 2026",
    summary: "A broad reliability release across Windows, test routing, MCP, the Action, and diagnostics.",
    groups: [
      {
        label: "Added",
        items: [
          "New diagnostics identify unread content, missing tracked paths, duplicate real paths, generated-path dominance, and missing related tests.",
          "MCP explain gained working-tree controls, the product page gained Compare, and the site gained robots.txt."
        ]
      },
      {
        label: "Fixed",
        items: [
          "Windows path normalization, BOM and UTF-16 manifests, common GitHub URL forms, failed diff handling, and additional source languages now behave consistently.",
          "Workspace test routing, Action exclusions and comments, and stemming were hardened with regression coverage."
        ]
      }
    ]
  },
  {
    version: "0.8.1",
    date: "August 1, 2026",
    summary: "The first large dogfooding sweep closed gaps across every FixMap surface.",
    groups: [
      {
        label: "Added",
        items: [
          "Compare and Doctor MCP tools, working-tree controls, browser-safe exports, and Action inputs for limit, exclude, and untracked files.",
          "Release gates now verify the npm latest tag, canonical homepage metadata, internal versions, and a clean installation before publishing."
        ]
      },
      {
        label: "Fixed",
        items: [
          "CLI validation, comparison output, exclusions, confidence, risk evidence, JSON ranks, test routing, and Action comment selection."
        ]
      }
    ]
  },
  {
    version: "0.8.0",
    date: "August 1, 2026",
    summary: "Plan, focus, compare, and verify became one coherent workflow.",
    groups: [
      {
        label: "Added",
        items: [
          "Go and Rust test routing, fixmap doctor, plan comparison, exclusions, result limits, working-tree mode, progress phases, pull-request URLs, and Action verify mode.",
          "MCP explain lets agents investigate a missing file without shell access."
        ]
      },
      {
        label: "Fixed",
        items: [
          "Confidence now reflects real ranking separation instead of labeling a whole result page high.",
          "Language detection, diagnostic bounds, file-mention performance, duplicate flags, verify output, and report consistency were corrected."
        ]
      },
      {
        label: "Security",
        items: [
          "Unbounded user text no longer flows into JSON reports, CI logs, or pull-request comments."
        ]
      }
    ]
  }
];

const icons = {
  Added: Plus,
  Fixed: Wrench,
  Improved: Sparkle,
  Security: ShieldCheck,
  Evidence: ChartLineUp
} as const;

const releaseId = (version: string) => `v-${version.toLowerCase().replaceAll(".", "-")}`;

export default function ChangelogPage() {
  return (
    <main>
      <section className="subpage-hero page-shell changelog-hero">
        <p className="eyebrow">Product changelog</p>
        <h1>Every improvement.{" "}<br /><em>Plainly recorded.</em></h1>
        <p>New features, important fixes, and the evidence behind each recent FixMap release.</p>
        <div className="changelog-hero-meta">
          <span><CheckCircle size={19} weight="fill" aria-hidden /> Current package: v{siteStats.version}</span>
          <a className="text-link" href={`${repoUrl}/blob/main/CHANGELOG.md`}>Read the complete history <ArrowRight size={17} weight="bold" aria-hidden /></a>
        </div>
      </section>

      <section className="section page-shell changelog-layout">
        <aside className="release-index" aria-label="Recent releases">
          <strong>Recent releases</strong>
          <nav>
            {releases.map((release) => (
              <a key={release.version} href={`#${releaseId(release.version)}`}>
                <span>v{release.version}</span>
                <small>{release.date}</small>
              </a>
            ))}
          </nav>
        </aside>

        <div className="release-list">
          {releases.map((release) => (
            <article className="release-entry" id={releaseId(release.version)} key={release.version}>
              <header className="release-heading">
                <div>
                  <p>{release.date}</p>
                  <h2>FixMap v{release.version}</h2>
                </div>
                {release.label ? <span>{release.label}</span> : null}
              </header>
              <p className="release-summary">{release.summary}</p>
              <div className="release-groups">
                {release.groups.map((group) => {
                  const Icon = icons[group.label];
                  return (
                    <section className="release-group" key={group.label}>
                      <h3><Icon size={19} weight="bold" aria-hidden /> {group.label}</h3>
                      <ul>
                        {group.items.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section dark-section">
        <div className="page-shell changelog-bottom">
          <div><p className="eyebrow">Nothing hidden</p><h2>Every release stays inspectable.</h2><p>The repository contains the full history, exact test evidence, and source for every change.</p></div>
          <a className="button light" href={`${repoUrl}/releases`}>Browse GitHub releases <ArrowRight size={18} weight="bold" aria-hidden /></a>
        </div>
      </section>
    </main>
  );
}
