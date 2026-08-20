import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  FileText,
  GitBranch,
  ShieldWarning
} from "@phosphor-icons/react/ssr";
import { homepageDefaultEvidence } from "../_lib/homepage-demo";

const sampleEvidence = {
  file: homepageDefaultEvidence.editCandidate!.path,
  test: homepageDefaultEvidence.testRoute!.command,
  related: homepageDefaultEvidence.impactFile!.path,
  risk: homepageDefaultEvidence.risk!.area
};

export const metadata: Metadata = {
  title: "Real ways to use FixMap",
  description: "See 13 everyday coding situations where FixMap can point an AI coding tool to files, tests, related code, risks, or honest uncertainty.",
  alternates: { canonical: "/use-cases" },
  openGraph: {
    title: "13 real ways to use FixMap",
    description: "From an unfamiliar project to a finished pull request, see exactly where FixMap fits.",
    url: "/use-cases"
  }
};

const useCases = [
  {
    number: "02",
    title: "You paste one strange error from production.",
    problem: "The message names a function or constant, but not the file that caused it.",
    result: "FixMap uses the exact words from the error and code names it can confirm. Then it shows matching files and tests.",
    capability: "Plan"
  },
  {
    number: "03",
    title: "Your AI tool suggests a file that looks wrong.",
    problem: "You expected one file, but it is missing from FixMap's first results.",
    result: "Ask FixMap about that file. It can explain why the file appears lower, why FixMap left it out, or why it could not read it.",
    capability: "Explain"
  },
  {
    number: "04",
    title: "The project has 40 packages and too many test commands.",
    problem: "The main test command may be slow or may not cover the part you are changing.",
    result: "FixMap finds the package that owns the file, then points to that package's test command and nearby tests.",
    capability: "Test routing"
  },
  {
    number: "05",
    title: "Your AI tool keeps opening built files instead of source code.",
    problem: "A generated file in a build folder looks relevant because it repeats every useful code word.",
    result: "FixMap can warn that the file was generated and point you back toward the source code people actually maintain.",
    capability: "Explain"
  },
  {
    number: "06",
    title: "One small edit may affect code somewhere else.",
    problem: "The file looks isolated, but another route, test, or package may depend on it.",
    result: "It shows code this file uses, code that uses it, matching tests, and files often changed with it.",
    capability: "Impact Graph"
  },
  {
    number: "07",
    title: "The ticket only says “make it better.”",
    problem: "There is not enough detail to choose a file honestly.",
    result: "FixMap can return no file suggestions and ask for a failing behavior, error message, command, code name, or path instead of making up an answer.",
    capability: "Uncertainty"
  },
  {
    number: "08",
    title: "You add one useful detail to a vague task.",
    problem: "You want to know whether the better wording actually changed the result.",
    result: "Compare shows which files appeared, disappeared, moved up or down, or became more or less certain.",
    capability: "Compare"
  },
  {
    number: "09",
    title: "The AI tool finished editing. Did it follow the plan?",
    problem: "The final change may touch files that were never discussed or skip the leading file entirely.",
    result: "Verify compares the saved list with the files the AI tool actually changed. It points out extra files, important files it skipped, and tests or risk areas to review.",
    capability: "Verify"
  },
  {
    number: "10",
    title: "The fix takes several rounds.",
    problem: "The files and risks can change while the AI tool keeps editing.",
    result: "Watch checks again each time files change. It reads the files and their history but does not run the project.",
    capability: "Watch"
  },
  {
    number: "11",
    title: "Your AI tool needs source code, not just file names.",
    problem: "Sending the whole project is noisy, but a list of paths is not enough to work from.",
    result: "Context packs the most useful pieces of code into a fixed size limit and tells you what it left out.",
    capability: "Context"
  },
  {
    number: "12",
    title: "You want the same map on every pull request.",
    problem: "Reviewers should not have to run a local command just to see the planned files, checks, and risks.",
    result: "The GitHub Action can add or update one FixMap report on a pull request instead of posting duplicate comments.",
    capability: "GitHub Action"
  },
  {
    number: "13",
    title: "You want to know whether FixMap works on your own project.",
    problem: "A public test cannot tell you how file finding behaves in your project.",
    result: "Benchmark checks older changes from your project and compares FixMap with a basic code search. It reads files and history without running the project.",
    capability: "Benchmark"
  }
] as const;

export default function UseCasesPage() {
  return (
    <main className="use-cases-page">
      <section className="use-cases-hero page-shell">
        <h1>When a coding problem leaves you asking, “Where do I even start?”</h1>
        <p>
          FixMap checks the problem and the project together. These are 13 real moments when that
          starting list can help—and what FixMap can honestly show.
        </p>
        <div className="button-row">
          <Link className="button primary" href="/demo">Try one in the sample project <ArrowRight size={17} weight="bold" aria-hidden /></Link>
          <Link className="button secondary" href="/get-started">Use FixMap on my project</Link>
        </div>
      </section>

      <section className="use-case-feature page-shell" aria-labelledby="use-case-one-title">
        <div className="use-case-feature-copy">
          <span className="use-case-index">01</span>
          <h2 id="use-case-one-title">You open a project you have never seen.</h2>
          <p>
            The bug says <code>TOKEN_TTL_MINUTES</code> is ignored and reset links expire immediately.
            You do not know which file handles resets, which test proves it, or what else should be reviewed.
          </p>
          <strong>FixMap gives the AI tool a place to begin without claiming it already knows the fix.</strong>
        </div>
        <div className="use-case-output" aria-label="Real output from the bundled sample project">
          <p>Real output from the sample project</p>
          <dl>
            <div><dt><FileText size={18} aria-hidden /> File to check first</dt><dd><code>{sampleEvidence.file}</code></dd></div>
            <div><dt><CheckCircle size={18} weight="fill" aria-hidden /> Test to run</dt><dd><code>{sampleEvidence.test}</code></dd></div>
            <div><dt><GitBranch size={18} aria-hidden /> Other code to review</dt><dd><code>{sampleEvidence.related}</code></dd></div>
            <div><dt><ShieldWarning size={18} aria-hidden /> Area to review</dt><dd>{sampleEvidence.risk}</dd></div>
          </dl>
          <small>This is genuine FixMap output from the bundled <code>sample-api</code> project.</small>
        </div>
      </section>

      <section className="use-case-library page-shell" aria-labelledby="more-use-cases-title">
        <header>
          <h2 id="more-use-cases-title">More moments where FixMap fits.</h2>
          <p>Each row describes a real FixMap workflow. No customer story or guaranteed result is invented.</p>
        </header>
        <div className="use-case-list">
          {useCases.map((useCase) => (
            <article className="use-case-row" key={useCase.number}>
              <span className="use-case-index">{useCase.number}</span>
              <div className="use-case-story">
                <h3>{useCase.title}</h3>
                <p>{useCase.problem}</p>
              </div>
              <div className="use-case-result">
                <strong>{useCase.capability}</strong>
                <p>{useCase.result}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="use-cases-final page-shell">
        <div>
          <h2>See a situation you recognize?</h2>
          <p>Try FixMap on the sample project first. If the output makes sense, add it to your own workflow.</p>
        </div>
        <div className="button-row">
          <Link className="button primary" href="/demo">Try the sample <ArrowRight size={17} weight="bold" aria-hidden /></Link>
          <Link className="button secondary" href="/get-started">Get started</Link>
        </div>
      </section>
    </main>
  );
}
