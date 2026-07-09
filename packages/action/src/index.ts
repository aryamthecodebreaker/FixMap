import { appendFileSync, readFileSync } from "node:fs";
import {
  buildRiskNotes,
  buildSummary,
  buildTestRoutes,
  rankContextFiles,
  renderJsonReport,
  renderMarkdownReport,
  scanRepo
} from "@fixmap/core";
import type { FixMapReport } from "@fixmap/core";
import { buildPullRequestIssueText, createGitHubClient } from "./github.js";

const event = readEvent(process.env.GITHUB_EVENT_PATH);
const issue = readInput("issue") || buildPullRequestIssueText(event);
const targetRepo = process.cwd();
const diffSpec = readInput("diff");
const baseRef = readInput("base") || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined);
const headRef = readInput("head") || (process.env.GITHUB_HEAD_REF ? "HEAD" : undefined);
const format = readInput("format") === "json" ? "json" : "markdown";

const repo = await scanRepo({
  repoRoot: targetRepo,
  diffSpec,
  baseRef,
  headRef
});
const contextFiles = rankContextFiles(repo, {
  issueText: issue,
  diffText: repo.diffText
});
const contextPaths = contextFiles.map((file) => file.path);
const testRoutes = buildTestRoutes(repo, contextPaths);
const report: FixMapReport = {
  summary: buildSummary(contextFiles.length, testRoutes.length),
  contextFiles,
  testRoutes,
  risks: buildRiskNotes(contextPaths),
  changedFiles: repo.changedFiles
};
const markdown = renderMarkdownReport(report);
const output = format === "json" ? renderJsonReport(report) : markdown;

process.stdout.write(output);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}

const token = readInput("github-token") || process.env.GITHUB_TOKEN;
if (token) {
  await upsertPullRequestComment(token, event, markdown);
}

function readInput(name: string): string | undefined {
  const githubName = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const shellSafeName = `INPUT_${name.replace(/[- ]/g, "_").toUpperCase()}`;
  const value = process.env[githubName] || process.env[shellSafeName];
  return value?.trim() || undefined;
}

function readEvent(eventPath: string | undefined): import("./github.js").PullRequestEvent | undefined {
  if (!eventPath) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(eventPath, "utf8")) as import("./github.js").PullRequestEvent;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`FixMap could not read the GitHub event payload: ${detail}`);
  }
}

async function upsertPullRequestComment(
  token: string,
  event: import("./github.js").PullRequestEvent | undefined,
  markdown: string
): Promise<void> {
  if (!event?.pull_request?.number || !process.env.GITHUB_REPOSITORY) {
    return;
  }

  const [owner, repoName] = process.env.GITHUB_REPOSITORY.split("/");
  if (!owner || !repoName) {
    throw new Error("FixMap requires GITHUB_REPOSITORY in owner/repository form to comment on a pull request.");
  }

  await createGitHubClient().upsertPullRequestComment({
    token,
    owner,
    repo: repoName,
    issueNumber: event.pull_request.number,
    markdown
  });
}
