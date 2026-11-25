import type { Metadata } from "next";
import { CheckCircle, CircleDashed, Hash, MinusCircle, XCircle } from "@phosphor-icons/react/ssr";
import { repoUrl, siteStats } from "../_lib/site-data";

export const metadata: Metadata = {
  title: "Evidence",
  description: "Every FixMap measurement: fresh projects in seven languages, keyword-search baselines, features, confidence and the things not measured yet.",
  alternates: { canonical: "/evidence" },
  openGraph: { title: "FixMap evidence", description: "Every result, including the misses and the checks that did not pass.", url: "/evidence" }
};

const rate = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`);
const count = (value: number | null | undefined, cases: number) => (value === null || value === undefined ? 0 : Math.round(value * cases));

const fresh = siteStats.languages;
const unmentioned = siteStats.heldout.cohorts.unmentioned;
const baselines = siteStats.baselines.heldout;
const bench = siteStats.featureBench.bars;

type Status = "pass" | "neutral" | "fail" | "skip";
const barsMet = [bench.verify, bench.changeScope, bench.reviewers, bench.historicalPlans].filter((bar) => bar.meetsBar).length;
const featureStatus: Status = barsMet === 4 ? "pass" : barsMet > 0 ? "neutral" : "fail";
const icon = (status: Status) =>
  status === "pass" ? <CheckCircle weight="fill" aria-hidden /> :
    status === "neutral" ? <MinusCircle weight="fill" aria-hidden /> :
      status === "fail" ? <XCircle weight="fill" aria-hidden /> : <CircleDashed weight="bold" aria-hidden />;

const summary: Array<{ id: string; status: Status; title: string; result: string }> = [
  { id: "languages", status: "pass", title: "Finds the file a real fix changed, in 7 languages", result: `${count(fresh.fixmapTop5, fresh.cases)}/${fresh.cases} in top 5` },
  { id: "keyword", status: "neutral", title: "Beats plain keyword search", result: `about even (p = ${fresh.top5PValue})` },
  { id: "unsure", status: "pass", title: "Says when it is not sure", result: `${siteStats.adversarial.passed}/${siteStats.adversarial.cases}` },
  { id: "features", status: featureStatus, title: "Features beat simple baselines", result: `${[bench.verify, bench.changeScope, bench.reviewers, bench.historicalPlans].filter((bar) => bar.meetsBar).length} of 4 bars met` },
  { id: "labels", status: "neutral", title: "Confidence labels match accuracy", result: "small sample" },
  { id: "agents", status: "skip", title: "Saves AI tools time, tokens or money", result: "not run yet" }
];

export default function EvidencePage() {
  return (
    <>
      <div className="shell page-head">
        <h1>Evidence</h1>
        <p>
          Each test case is a real bug later fixed by a merged pull request. FixMap sees the project as it was before the fix and tries
          to point at the file that changed. Pass bars were written down before each run, and the misses stay on this page.
        </p>
      </div>

      <div className="shell read-layout">
        <nav className="toc" aria-label="Evidence sections">
          {summary.map((item) => <a key={item.id} href={`#${item.id}`}><Hash aria-hidden />{item.title.split(",")[0]}</a>)}
          <a href="#cases"><Hash aria-hidden />Every case</a>
        </nav>

        <div>
          <div className="checks">
            <div className="checks-head"><strong>{summary.length} checks</strong><span>Each check links to its full results below.</span></div>
            {summary.map((item) => (
              <div key={item.id} className={`check ${item.status === "fail" ? "neutral" : item.status}`}>
                {icon(item.status)}
                <div><strong><a href={`#${item.id}`}>{item.title}</a></strong></div>
                <span className="result">{item.result}</span>
              </div>
            ))}
          </div>

          <article className="prose" style={{ padding: "0" }}>
            <h2 id="languages">Fresh projects in seven languages</h2>
            <p>{fresh.cases} merged fixes, 15 per language, from open-source projects no FixMap test had used. The projects, cases and bar were committed to GitHub before FixMap ran on them. &ldquo;Top 5&rdquo; means the changed file was in the first five results.</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Language</th><th className="num">Cases</th><th className="num">FixMap top 5</th><th className="num">Keyword search top 5</th></tr></thead>
                <tbody>
                  {fresh.rows.map((row) => <tr key={row.language}><td>{row.language}</td><td className="num">{row.cases}</td><td className="num">{row.fixmap}</td><td className="num">{row.bm25}</td></tr>)}
                  <tr><td><strong>All seven</strong></td><td className="num"><strong>{fresh.cases}</strong></td><td className="num"><strong>{count(fresh.fixmapTop5, fresh.cases)} ({rate(fresh.fixmapTop5)})</strong></td><td className="num"><strong>{count(fresh.bm25Top5, fresh.cases)} ({rate(fresh.bm25Top5)})</strong></td></tr>
                </tbody>
              </table>
            </div>

            <h2 id="keyword">Against plain keyword search</h2>
            <p>
              The comparison is BM25 over code files, a standard keyword search, run on exactly the same files. On the {fresh.cases} fresh cases above,
              FixMap is ahead in the top 5 ({rate(fresh.fixmapTop5)} against {rate(fresh.bm25Top5)}) and slightly behind at the very first result
              ({rate(fresh.fixmapTop1)} against {rate(fresh.bm25Top1)}). Neither difference is significant (paired McNemar exact test, p = {fresh.top5PValue}).
              We set the bar for a win before the run, and FixMap did not meet it. <strong>So: about as good as keyword search, not clearly better.</strong>
            </p>
            <p>The earlier JavaScript and TypeScript set says the same. On the {unmentioned.cases} tasks that did not name the file:</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Method</th><th className="num">Top 1</th><th className="num">Top 3</th><th className="num">Top 5</th></tr></thead>
                <tbody>
                  <tr><td>Read file paths out of the task</td><td className="num">{rate(baselines.pathExtraction.top1HitRate)}</td><td className="num">{rate(baselines.pathExtraction.top3HitRate)}</td><td className="num">{rate(baselines.pathExtraction.top5HitRate)}</td></tr>
                  <tr><td>Literal keyword search</td><td className="num">{rate(baselines.lexical.top1HitRate)}</td><td className="num">{rate(baselines.lexical.top3HitRate)}</td><td className="num">{rate(baselines.lexical.top5HitRate)}</td></tr>
                  <tr><td>BM25 keyword search</td><td className="num">{rate(baselines.bm25.top1HitRate)}</td><td className="num">{rate(baselines.bm25.top3HitRate)}</td><td className="num">{rate(baselines.bm25.top5HitRate)}</td></tr>
                  <tr><td><strong>FixMap</strong></td><td className="num"><strong>{rate(baselines.fixmap.top1HitRate)}</strong></td><td className="num"><strong>{rate(baselines.fixmap.top3HitRate)}</strong></td><td className="num"><strong>{rate(baselines.fixmap.top5HitRate)}</strong></td></tr>
                </tbody>
              </table>
            </div>

            <h2 id="unsure">Saying when it is not sure</h2>
            <p>
              {siteStats.adversarial.cases} tasks were built to tempt a confident wrong answer: made-up function names, the wrong project, tasks with no clues,
              and generated files. FixMap passed {siteStats.adversarial.passed} of {siteStats.adversarial.cases}, with a false-confidence rate of {Math.round(siteStats.adversarial.falseConfidenceRate * 100)}%.
            </p>

            <h2 id="features">Features against simple baselines</h2>
            <p>Measured on {siteStats.featureBench.available} real fixes with bars written before the run. A feature that misses keeps its preview label until a fresh test passes.</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Feature</th><th className="num">FixMap</th><th>Bar</th><th>Result</th></tr></thead>
                <tbody>
                  <tr><td>Verify names every changed file</td><td className="num">{bench.verify.passed}/{bench.verify.of}</td><td>every case</td><td>{bench.verify.meetsBar ? "Met" : "Missed"}</td></tr>
                  <tr><td>Change scope finds the other changed files</td><td className="num">{rate(bench.changeScope.fixmapRecall)}</td><td>above same-folder listing ({rate(bench.changeScope.baselineRecall)})</td><td>{bench.changeScope.meetsBar ? "Met" : "Missed"}</td></tr>
                  <tr><td>Reviewer suggestions include the fix&apos;s author</td><td className="num">{rate(bench.reviewers.fixmapHitRate)}</td><td>above busiest committers ({rate(bench.reviewers.baselineHitRate)})</td><td>{bench.reviewers.meetsBar ? "Met" : "Missed"}</td></tr>
                  <tr><td>Plans for an older commit match a checkout</td><td className="num">{bench.historicalPlans.passed}/{bench.historicalPlans.of}</td><td>every case</td><td>{bench.historicalPlans.meetsBar ? "Met" : "Missed"}</td></tr>
                </tbody>
              </table>
            </div>
            <p>Fixes for all four are in progress and will be judged again on fresh cases, not the ones above. <a href={`${repoUrl}/blob/main/benchmarks/feature-bench/PREREGISTRATION.md`}>Read the bars</a>.</p>

            <h2 id="labels">Confidence labels</h2>
            <p>Labels are bands of evidence, not probabilities. In this small sample, high confidence is not reliably more accurate than medium.</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Top label</th><th className="num">Cases</th><th className="num">Right first time</th><th className="num">Accuracy</th></tr></thead>
                <tbody>
                  {siteStats.confidenceCalibration.map((band) => <tr key={band.confidence}><td>{band.confidence}</td><td className="num">{band.cases}</td><td className="num">{band.correct}</td><td className="num">{rate(band.accuracy)}</td></tr>)}
                </tbody>
              </table>
            </div>

            <h2 id="agents">Not measured yet</h2>
            <p>
              Whether FixMap makes an AI coding tool faster, cheaper or more likely to finish a task has not been measured. A four-arm study is written
              down (<a href={`${repoUrl}/blob/main/docs/AGENT_STUDY.md`}>read the protocol</a>), but until real runs are done and checked, this site makes no such claim.
            </p>
            <p>You can measure FixMap on your own project&apos;s history any time: <code>fixmap benchmark --repo . --last 50</code>.</p>

            <h2 id="cases">Every JavaScript and TypeScript case</h2>
            <p>The file the merged fix changed, FixMap&apos;s first result, and whether the right file was in its top 3.</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Project and issue</th><th>File the fix changed</th><th>FixMap&apos;s first result</th><th>Top 3</th></tr></thead>
                <tbody>
                  {siteStats.heldout.results.map((result) => (
                    <tr key={result.slug}>
                      <td><a href={`https://github.com/${result.slug}/issues/${result.issue}`}>{result.slug} #{result.issue}</a></td>
                      <td><code>{result.expected[0]}</code></td>
                      <td><code>{result.top5Paths[0]}</code></td>
                      <td>{result.top3Hit ? "Hit" : "Miss"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>All raw data, scripts and rules are in the repository: <a href={`${repoUrl}/tree/main/benchmarks`}>benchmarks/</a>.</p>
          </article>
        </div>
      </div>
    </>
  );
}
