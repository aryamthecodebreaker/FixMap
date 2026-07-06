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
  const existing = await findExistingComment(commentsUrl, headers, marker);

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

async function findExistingComment(
  commentsUrl: string,
  headers: Record<string, string>,
  marker: string
): Promise<{ id: number; body?: string } | undefined> {
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(`${commentsUrl}?per_page=100&page=${page}`, { headers });
    const comments = await response.json() as Array<{ id: number; body?: string }>;
    if (!Array.isArray(comments) || comments.length === 0) {
      return undefined;
    }

    const existing = comments.find((comment) => comment.body?.includes(marker));
    if (existing) {
      return existing;
    }

    if (comments.length < 100) {
      return undefined;
    }
  }

  return undefined;
}
