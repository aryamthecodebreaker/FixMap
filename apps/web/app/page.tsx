import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  CircleDashed,
  FileCode,
  GitCommit,
  GitMerge,
  GitPullRequest,
  MinusCircle
} from "@phosphor-icons/react/ssr";
import { Install } from "./_components/install";
import { LoopFilm } from "./_components/loop-film";
import { Mark } from "./_components/logo";
import { PrTabs } from "./_components/pr-tabs";
import { actionWorkflow, repoUrl, siteStats } from "./_lib/site-data";
import { loadUsageStats, USAGE_REFRESH_SECONDS } from "./_lib/usage-stats";
import { Review } from "./demo";

export const revalidate = 300;

const fresh = siteStats.languages;
const count = (rate: number, cases: number) => Math.round(rate * cases);
const fixmapHits = count(fresh.fixmapTop5, fresh.cases);
const keywordHits = count(fresh.bm25Top5, fresh.cases);
const adversarial = siteStats.adversarial;

export default async function Home() {
  const usage = await loadUsageStats().catch(() => null);
  const downloads = usage?.sinceLaunchWithCore ?? usage?.sinceLaunch;

  return (
    <>
      <div className="shell pr-head">
        <div className="pr-top">
          <h1 className="pr-title">
            Tell your AI coding tool which files to check first <span className="num">#{siteStats.version}</span>
          </h1>
          <div className="pr-actions">
            <a className="btn btn-quiet" href="#conversation">Try it</a>
            <a className="btn btn-primary" href="#merge">Install FixMap</a>
          </div>
        </div>
        <div className="pr-meta">
          <span className="state"><GitPullRequest size={16} weight="bold" aria-hidden /> Ready to review</span>
          <span>Free, open source, and private: it runs on your computer.</span>
        </div>
        <p className="pr-lede">
          Describe what is broken. FixMap checks the code and tells <strong>Claude Code, Codex, Cursor</strong> or any AI coding tool
          which files to open, which test to run and what else to look at. No account, no API key, no AI model.
        </p>
      </div>

      <PrTabs />

      <div className="shell pr-layout" id="conversation">
        <Review />
        <aside className="side" aria-label="About FixMap">
          <div className="side-block">
            <h2>Reviewer</h2>
            <div className="reviewer"><Mark className="mark" /> FixMap <CheckCircle className="ok" weight="fill" aria-label="approved" /></div>
          </div>
          <div className="side-block">
            <h2>Works with</h2>
            <div className="labels">
              <span className="label">Claude Code</span>
              <span className="label">Codex</span>
              <span className="label">Cursor</span>
              <span className="label">GitHub Copilot</span>
              <span className="label">any MCP client</span>
            </div>
          </div>
          <div className="side-block">
            <h2>Runs</h2>
            <div className="labels">
              <span className="label g">on your computer</span>
              <span className="label g">no API key</span>
              <span className="label g">no AI model</span>
              <span className="label g">open source</span>
            </div>
          </div>
          <div className="side-block">
            <h2>Activity</h2>
            {usage && downloads !== undefined && downloads !== null ? (
              <>
                <div className="stat-line"><span>Downloads since July</span><b>{downloads.toLocaleString("en-US")}</b></div>
                <div className="stat-line"><span>Last 7 days</span><b>{usage.lastWeek.toLocaleString("en-US")}</b></div>
                <p className="note">Live from npm (CLI and engine), refreshed every {USAGE_REFRESH_SECONDS / 60} minutes. A download is not a person.</p>
              </>
            ) : (
              <p>npm could not be reached just now, so no number is shown.</p>
            )}
          </div>
        </aside>
      </div>

      <section className="shell section" id="commits" aria-labelledby="commits-heading">
        <div className="section-head">
          <h2 id="commits-heading">How FixMap builds the list</h2>
          <p>No AI model. Every item comes with the evidence behind it, from your own project.</p>
        </div>
        <div className="commits">
          <div className="commit">
            <FileCode aria-hidden />
            <div><strong>Matches the task to names in the code</strong><p>Function names, constants, file paths and error text from your task, found where they are defined.</p></div>
            <span className="sha">names</span>
          </div>
          <div className="commit">
            <GitCommit aria-hidden />
            <div><strong>Follows imports and finds the nearest tests</strong><p>What the file uses, what uses it, and which test command checks it.</p></div>
            <span className="sha">imports</span>
          </div>
          <div className="commit">
            <GitMerge aria-hidden />
            <div><strong>Checks which files change together</strong><p>Recent Git history shows code that usually moves with the file, so it is worth a look too.</p></div>
            <span className="sha">history</span>
          </div>
        </div>
      </section>

      <section className="shell section" id="checks" aria-labelledby="checks-heading">
        <div className="section-head">
          <h2 id="checks-heading">Checks, including the ones that did not pass</h2>
          <p>Measured on real bugs from open-source projects FixMap had never seen, with the pass bar written down before each run.</p>
        </div>
        <div className="checks">
          <div className="checks-head">
            <strong>4 checks</strong>
            <span>2 passed · 1 about even · 1 not run yet</span>
          </div>
          <div className="check pass">
            <CheckCircle weight="fill" aria-hidden />
            <div>
              <strong>Finds the file a real fix changed</strong>
              <p>In its top 5 for {fixmapHits} of {fresh.cases} fixes from never-seen projects in Python, Java, Go, Rust, Ruby, PHP and C#.</p>
            </div>
            <span className="result">{fixmapHits}/{fresh.cases}</span>
          </div>
          <div className="check neutral">
            <MinusCircle weight="fill" aria-hidden />
            <div>
              <strong>Beats plain keyword search</strong>
              <p>About even: {fixmapHits} against {keywordHits} in the top 5, not a significant difference (p = {fresh.top5PValue}). We say so instead of claiming a win.</p>
            </div>
            <span className="result">{fixmapHits} vs {keywordHits}</span>
          </div>
          <div className="check pass">
            <CheckCircle weight="fill" aria-hidden />
            <div>
              <strong>Says when it is not sure</strong>
              <p>On {adversarial.cases} tasks built to fool it, with made-up names or no clues, it stayed low-confidence every time instead of inventing an answer.</p>
            </div>
            <span className="result">{adversarial.passed}/{adversarial.cases}</span>
          </div>
          <div className="check skip">
            <CircleDashed weight="bold" aria-hidden />
            <div>
              <strong>Saves your AI tool time, tokens or money</strong>
              <p>Not measured yet. The study is written down; no runs have been done, so we make no claim.</p>
            </div>
            <span className="result">not run</span>
          </div>
          <div className="checks-foot"><Link href="/evidence">See every result and test case <ArrowRight size={14} weight="bold" aria-hidden style={{ display: "inline", verticalAlign: "-2px" }} /></Link></div>
        </div>
      </section>

      <section className="shell section" id="merge" aria-labelledby="merge-heading">
        <div className="merge">
          <div className="avatar" aria-hidden><GitMerge weight="bold" /></div>
          <div className="merge-box">
            <div className="merge-top">
              <h2 id="merge-heading">Ready to use on your own project</h2>
              <p>Free and open source. Pick where you want the starting list to show up.</p>
            </div>
            <Install workflow={actionWorkflow} />
            <div className="merge-actions">
              <Link className="btn btn-primary" href="/docs">Read the setup guide <ArrowRight size={16} weight="bold" aria-hidden /></Link>
              <a className="btn btn-quiet" href={repoUrl}>View the source</a>
            </div>
          </div>
        </div>
      </section>

      <section className="shell closing" aria-labelledby="closing-heading">
        <div>
          <h2 id="closing-heading">Give your AI coding tool a better first step.</h2>
          <p>It still writes the fix. FixMap helps it start in the right place, and says so when it does not know.</p>
          <div className="actions">
            <a className="btn btn-primary" href="#conversation">Try it on the sample</a>
            <Link className="btn btn-quiet" href="/docs">Install FixMap</Link>
          </div>
        </div>
        <LoopFilm />
      </section>
    </>
  );
}
