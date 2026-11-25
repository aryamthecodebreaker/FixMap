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
    version: "0.9.14",
    date: "November 25, 2026",
    label: "Latest release",
    summary: "Rust and Ruby projects are read the way Cargo and Rails read them, which finishes support for all seven added languages.",
    groups: [
      {
        label: "Added",
        items: [
          "Rust: every way Cargo lets you write a dependency, build scripts, and files pulled in with include!.",
          "Ruby: extra autoload folders configured in Rails, Rails engines (including ones a host app pulls in), and Rake test tasks with custom names."
        ]
      }
    ]
  },
  {
    version: "0.9.13",
    date: "November 25, 2026",
    summary: "Go and PHP projects are read the way their own tools read them: generated and vendored Go code, Composer globs and custom test scripts, and directory-based PHP includes.",
    groups: [
      {
        label: "Added",
        items: [
          "Go: code generators marked to be ignored by the build are no longer treated as part of the package, and vendored packages resolve when vendor/modules.txt lists them.",
          "PHP: Composer path repositories with wildcards, test scripts with names other than \"test\", the folders Pest.php points at, and includes written as __DIR__ . '/file.php'."
        ]
      },
      {
        label: "Improved",
        items: [
          "Generated Go files (\"DO NOT EDIT\") are ranked down, with a note to change the generator instead."
        ]
      }
    ]
  },
  {
    version: "0.9.12",
    date: "November 25, 2026",
    summary: "The self-hosted container is now security-scanned on every change, and .NET projects are understood the way MSBuild reads them.",
    groups: [
      {
        label: "Added",
        items: [
          ".NET: .slnx solutions, shared Directory.Build.props and .targets settings, the SDK's default usings, and source files linked in from other folders.",
          "Every container change is scanned for known vulnerabilities on Intel and ARM, with a parts list (SBOM) of each image kept with the run."
        ]
      },
      {
        label: "Security",
        items: [
          "The first scan found the MCP image carried build tools it never runs, one with a critical flaw; it now contains only what it needs.",
          "Both images apply Debian security updates when built and no longer include npm."
        ]
      }
    ]
  },
  {
    version: "0.9.11",
    date: "November 24, 2026",
    summary: "Python, Java, Go, Rust, Ruby, PHP and .NET support is out of preview after passing a fresh test on 28 real fixes from projects FixMap had never seen.",
    groups: [
      {
        label: "Improved",
        items: [
          "Every language found the fixed file in its top 5 at least once: Python 4 of 4, Go 4 of 4, Java 3 of 4, Rust 3 of 4, PHP 3 of 4, .NET 3 of 4, Ruby 2 of 4.",
          "Overall FixMap found it in 22 of 28 cases, keyword search (BM25) in 19 of 28. The difference is not statistically significant, and the bar only asked for not worse.",
          "The cases and the pass bar were committed to GitHub before FixMap ran on them."
        ]
      }
    ]
  },
  {
    version: "0.9.10",
    date: "November 24, 2026",
    summary: "Plans against an older commit now read the code exactly like a checkout of that commit. On the same 40 real repositories, 40 now give identical results, up from 18.",
    groups: [
      {
        label: "Fixed",
        items: [
          "fixmap plan --at no longer ignores large files or Git history when planning against an older commit.",
          "Re-check after the fix, on the same 40 repositories (labelled; the pre-registered result stays 18/40): 40/40 now give the identical top 5."
        ]
      },
      {
        label: "Added",
        items: [
          "A fresh test set of never-seen Java projects. A Java ranking change was tried and not shipped because it did not help there.",
          "A measurement of how often context excerpts contain the code a real fix changed; two alternative excerpt pickers were tried and not shipped."
        ]
      }
    ]
  },
  {
    version: "0.9.9",
    date: "November 24, 2026",
    summary: "FixMap was tested on 40 real bug fixes in eight languages it was never tuned on, with the pass bars written down first: 0 of 4 features met their bar.",
    groups: [
      {
        label: "Added",
        items: [
          "Verify and its narration: 39/40 real fixes passed (missed its bar and stays a preview).",
          "Change scope: recall 10% vs a same-folder baseline's 10% over 11 multi-file fixes (missed its bar and stays a preview).",
          "Reviewer suggestions: the author was in the top 3 for 40% of 20 eligible fixes vs 60% for the busiest committers (missed its bar and stays a preview; 20 fixes by first-time contributors excluded).",
          "Historical plans: 18/40 gave the identical top 5 (missed its bar and stays a preview)."
        ]
      },
      {
        label: "Improved",
        items: [
          "The Evidence page now shows results in seven more languages, including where FixMap is weak.",
          "Benchmark numbers on the homepage and Evidence page now come straight from the recorded results; a hand-written paragraph had gone out of date.",
          "The download counter checks npm every 5 minutes, shows which day npm counted through, and gives the combined total with the engine package."
        ]
      }
    ]
  },
  {
    version: "0.9.8",
    date: "November 24, 2026",
    summary: "Saved FixMap files stay readable across upgrades, fixmap ask resists instructions planted in reports, and the self-hosted container is proven on Intel and ARM.",
    groups: [
      {
        label: "Added",
        items: [
          "fixmap validate checks any saved FixMap file and says clearly when one came from a newer FixMap.",
          "fixmap ask warns when report text looks like instructions to an AI, never follows it, and makes links in answers inert."
        ]
      },
      {
        label: "Improved",
        items: [
          "The self-hosted container now includes git and is tested on both Intel and ARM machines with no network access.",
          "Files saved by FixMap 0.9.0, 0.9.5 and 0.9.7 are tested to keep working."
        ]
      },
      {
        label: "Fixed",
        items: [
          "Saving outcomes or dossiers from several programs at once on Windows no longer fails now and then.",
          "FixMap now says when it cannot read a folder, instead of reporting that it found nothing."
        ]
      }
    ]
  },
  {
    version: "0.9.7",
    date: "November 24, 2026",
    summary: "Cross-repository impact in Verify and pull requests, help writing architecture policy, breaking-contract rules that actually run, coordination between AI agents sharing a checkout, and clearer Verify wording.",
    groups: [
      {
        label: "Added",
        items: [
          "fixmap verify --workspace names the other repositories that use a package your change touched, and the GitHub Action can show the same as a pull request section.",
          "Workspace configs can link packages that are published under a different name, but only through an explicit, reviewed alias.",
          "fixmap policy init, check, and explain help you write and debug .fixmap/policy.json, and rules that forbid breaking API changes now run in Plan and Verify.",
          "fixmap intent and fixmap conflicts let AI agents working in the same checkout say what they plan to edit and spot overlaps before they collide."
        ]
      },
      {
        label: "Improved",
        items: [
          "Verify explains changes more clearly: a clean change no longer says it needs attention, and files changed outside the plan are called out.",
          "The new features are previews: they work and are tested, but may change before v0.10.0."
        ]
      },
      {
        label: "Fixed",
        items: [
          "The GitHub Action now says which check failed instead of always blaming a generated file.",
          "A rare crash when Git stopped early while FixMap read older versions of files."
        ]
      }
    ]
  },
  {
    version: "0.9.6",
    date: "November 23, 2026",
    summary: "Five previews: possible sensitive-data flows and dependency scanner findings in plans, side-by-side plan alternatives, editing product areas from AI agents, and contract, reviewer, and architecture sections on pull requests.",
    groups: [
      {
        label: "Added",
        items: [
          "fixmap plan --sensitive-data shows possible credential, token, personal-data, or payment flows near the files in a plan, without ever printing the values.",
          "fixmap plan --supply-chain attaches findings from your dependency scanner for the packages those files use.",
          "fixmap alternatives compares several possible plans side by side and states the trade-offs instead of picking a winner.",
          "AI agents can create, update, and remove product areas over MCP.",
          "The GitHub Action can add contract changes, suggested reviewers, and architecture drift to pull request comments, without notifying anyone."
        ]
      },
      {
        label: "Improved",
        items: ["All five are previews: they work and are tested, but may change before v0.10.0."]
      }
    ]
  },
  {
    version: "0.9.5",
    date: "November 22, 2026",
    summary: "Six previews: other tools' findings in plans, API contract checks, architecture drift and historical plans, reviewer suggestions, saved outcomes and dossiers, and new GitHub Action sections.",
    groups: [
      {
        label: "Added",
        items: [
          "fixmap plan --evidence attaches findings from scanners, CI, or monitoring tools to the files in a plan, labelled as the tool's claim and never executed.",
          "fixmap contracts lists API and schema contracts and classifies changes between two Git refs as compatible, breaking, or unknown.",
          "fixmap history reports architecture drift and broken architecture decisions between two commits, and fixmap plan --at ranks against an older commit.",
          "fixmap reviewers suggests reviewers from CODEOWNERS, notes, policy, and history without notifying anyone.",
          "fixmap outcome and fixmap dossier save what a plan predicted against what changed, locally and with optional redaction.",
          "The GitHub Action can add change-scope and capability-map sections to pull request comments."
        ]
      },
      {
        label: "Improved",
        items: ["All six are previews: they work and are tested, but may change before v0.10.0."]
      }
    ]
  },
  {
    version: "0.9.4",
    date: "November 22, 2026",
    summary: "Local semantic search now finishes on large repositories, and an honest test on 28 never-seen projects keeps language support in preview because Java missed.",
    groups: [
      {
        label: "Fixed",
        items: [
          "Local semantic search saves its progress in small batches, so a large repository's first run no longer times out and starts over every time.",
          "Release verification no longer fails for five minutes after a successful publish because of a stale npm cache."
        ]
      },
      {
        label: "Evidence",
        items: [
          "On 28 cases from projects no earlier test used, FixMap found a fixing file in its first five results 50% of the time, versus 39% for keyword search. Java found 0 of 4, so language support stays a preview.",
          "Repeat scans of changed repositories are about 30% faster at 1,000 files and 52% faster at 10,000 files."
        ]
      }
    ]
  },
  {
    version: "0.9.3",
    date: "November 22, 2026",
    summary: "Teach FixMap a new language from your own code, with broken plugins safely contained, plus live download numbers and a full feature list on this site.",
    groups: [
      {
        label: "Added",
        items: [
          "Custom language adapters are public: register definitions, imports, import resolution, and test-file naming for your own file extensions, and FixMap ranks and maps them like its built-in languages.",
          "A crashing or malformed adapter is contained and reported in one warning without leaking its error text, and reports record which adapters were used.",
          "The feature catalog behind fixmap features is shared, so other tools and this site read one list."
        ]
      },
      {
        label: "Improved",
        items: [
          "The homepage shows live npm download counts and GitHub stars, labelled as downloads rather than users.",
          "A new Features page lists all 36 features with the command for each, marking the 11 previews."
        ]
      }
    ]
  },
  {
    version: "0.9.2",
    date: "November 22, 2026",
    summary: "Ships the v0.10 work built so far: thirteen fixes, team notes on code, design decisions in reports, and wider language support, with unfinished commands clearly marked as previews.",
    groups: [
      {
        label: "Fixed",
        items: [
          "The MCP server returns the correct errors for requests sent before initialization and for malformed JSON.",
          "Reports keep direct imports between primary files, and context ranges no longer run one line past the end of a file.",
          "Earlier FixMap reports and setup files no longer compete with your code in ranking, and routed tests are tied to the file they actually import.",
          "Doctor recognizes Windows npm launchers as one installation, and long task text is directed to --issue-file instead of failing on Windows.",
          "Ten further correctness fixes from an external audit, plus history scoping for scans inside a larger Git checkout."
        ]
      },
      {
        label: "Added",
        items: [
          "fixmap annotate records reviewable notes with an owner and expiry on files, symbols, services, or contracts, and Plan reports show the active ones.",
          "Architecture decision records and pull-request rationale in the repository appear in reports as authored decisions.",
          "Plan reads imports, definitions, and test layouts for Python, Java, Go, Rust, Ruby, PHP, and .NET (preview quality while testing on unseen repositories continues)."
        ]
      },
      {
        label: "Improved",
        items: [
          "Change scope, capability maps, cross-repository workspaces, ask, migrate, reverse docs, history, supply-chain and runtime evidence, the sandbox, the editor protocol, and local semantic search are available as previews. They work and are tested, but may change before v0.10.0."
        ]
      }
    ]
  },
  {
    version: "0.9.1",
    date: "November 22, 2026",
    summary: "A security release: the MCP server's SDK and every flagged dependency are updated, with no change to ranking, reports, or commands.",
    groups: [
      {
        label: "Security",
        items: [
          "The CLI and MCP server now depend on @modelcontextprotocol/sdk 1.32.0, resolving six SDK security advisories.",
          "Every open advisory in FixMap's dependency tree is resolved, including the MCP transport stack and the website toolchain; npm audit reports zero vulnerabilities and every package has a verified registry signature."
        ]
      },
      {
        label: "Improved",
        items: ["Package metadata, the README, and the npm page point to the canonical site at fixmap.aryam.me."]
      }
    ]
  },
  {
    version: "0.9.0",
    date: "August 13, 2026",
    summary: "Impact Graph, budgeted Context Packs, portable graph export, continuous Watch, compact agent output, and honest repository-local benchmarking form FixMap's first feature release.",
    groups: [
      {
        label: "Added",
        items: [
          "Every plan now separates primary task-ranked context from likely impact backed by imports, reverse dependents, routed tests, and repeated Git co-change evidence.",
          "fixmap context packages deterministic source ranges within an explicit estimated-token budget and reports truncation or omissions.",
          "fixmap graph exports the Impact Graph as Mermaid or versioned JSON while preserving relationship direction and evidence.",
          "fixmap benchmark compares BM25, FixMap, and Impact Graph on identical historical parent snapshots without executing repository code.",
          "fixmap watch streams working-tree drift findings and recalculated impact as an agent edits, with Markdown or JSON Lines output.",
          "Compact agent output provides a stable edit, inspect, test, risk, avoid, and uncertainty handoff.",
          "A 32-second motion-first comparison shows two agents handling the same issue, with an original no-vocals soundtrack and no claim of measured agent efficiency."
        ]
      },
      {
        label: "Improved",
        items: [
          "Verify recalculates impact around the actual diff and keeps newly related paths advisory.",
          "CLI, MCP, GitHub Action, slash-command discovery, live demo, docs, and website expose the impact evidence consistently."
        ]
      },
      {
        label: "Evidence",
        items: [
          "The repository benchmark reports mentioned and unmentioned cohorts, Wilson intervals, raw cases, skip counts, and secondary-file recall.",
          "A frozen agent-study protocol is published without claiming an effectiveness result before controlled runs exist."
        ]
      }
    ]
  },
  {
    version: "0.8.9",
    date: "August 11, 2026",
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
          "External, held-out, adversarial, baseline, context-size proxy, scan-performance, package, generated-output, and 1,000-file scan gates are recorded and reproducible."
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
