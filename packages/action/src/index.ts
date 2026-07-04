import { appendFileSync, readFileSync } from "node:fs";
import {
  buildRiskNotes,
  buildTestRoutes,
  rankContextFiles,
  renderJsonReport,
  renderMarkdownReport,
  scanRepo
} from "@fixmap/core";
import type { FixMapReport } from "@fixmap/core";

const issue = readInput("issue") || "Pull request review";
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
  diffText: diffSpec ?? [baseRef, headRef].filter(Boolean).join(" ")
});
const contextPaths = contextFiles.map((file) => file.path);
const testRoutes = buildTestRoutes(repo, contextPaths);
const report: FixMapReport = {
  summary: `FixMap found ${contextFiles.length} context files and generated ${testRoutes.length} test routes.`,
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
  await upsertPullRequestComment(token, markdown);
}

function readInput(name: string): string | undefined {
  const githubName = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const shellSafeName = `INPUT_${name.replace(/[- ]/g, "_").toUpperCase()}`;
  const value = process.env[githubName] || process.env[shellSafeName];
  return value?.trim() || undefined;
}

async function upsertPullRequestComment(token: string, markdown: string): Promise<void> {
  if (!process.env.GITHUB_EVENT_PATH || !process.env.GITHUB_REPOSITORY) {
    return;
  }

  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) as {
    pull_request?: { number?: number };
  };
  const issueNumber = event.pull_request?.number;
  if (!issueNumber) {
    return;
  }

  const [owner, repoName] = process.env.GITHUB_REPOSITORY.split("/");
  if (!owner || !repoName) {
    return;
  }

  const marker = "<!-- fixmap-report -->";
  const body = `${marker}\n${markdown}`;
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28"
  };
  const commentsUrl = `https://api.github.com/repos/${owner}/${repoName}/issues/${issueNumber}/comments`;
  const commentsResponse = await fetch(commentsUrl, { headers });
  const comments = await commentsResponse.json() as Array<{ id: number; body?: string }>;
  const existing = Array.isArray(comments)
    ? comments.find((comment) => comment.body?.includes(marker))
    : undefined;

  if (existing) {
    await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues/comments/${existing.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ body })
    });
    return;
  }

  await fetch(commentsUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ body })
  });
}
