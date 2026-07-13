import { appendFileSync, readFileSync } from "node:fs";
import { buildFixMapReport, renderJsonReport, renderMarkdownReport } from "@aryam/fixmap-core";
import { buildPullRequestIssueText, createGitHubClient } from "./github.js";

const event = readEvent(process.env.GITHUB_EVENT_PATH);
const issue = readInput("issue") || buildPullRequestIssueText(event);
const targetRepo = process.cwd();
const diffSpec = readInput("diff");
const baseRef = readInput("base") || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined);
const headRef = readInput("head") || (process.env.GITHUB_HEAD_REF ? "HEAD" : undefined);
const format = readInput("format") === "json" ? "json" : "markdown";

if (!issue && !diffSpec && !baseRef) {
  throw new Error("FixMap needs a pull_request event, an issue input, or a diff/base input to build a useful report.");
}

const report = await buildFixMapReport({
  repoRoot: targetRepo,
  issueText: issue,
  diffSpec,
  baseRef,
  headRef
});
const markdown = renderMarkdownReport(report);
const output = format === "json" ? renderJsonReport(report) : markdown;

process.stdout.write(output);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}

if (process.env.GITHUB_OUTPUT) {
  const delimiter = `fixmap_${Date.now()}`;
  appendFileSync(process.env.GITHUB_OUTPUT, `report<<${delimiter}\n${output}${delimiter}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `context-count=${report.contextFiles.length}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `test-route-count=${report.testRoutes.length}\n`);
}

const token = readInput("github-token") || process.env.GITHUB_TOKEN;
const commentAuthor = readInput("comment-author");
if (token) {
  await upsertPullRequestComment(token, event, markdown, commentAuthor);
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
  markdown: string,
  commentAuthor: string | undefined
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
    markdown,
    commentAuthor
  });
}
