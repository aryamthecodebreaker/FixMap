import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { buildFixMapReport, renderJsonReport, renderMarkdownReport, type FixMapReport } from "@aryam/fixmap-core";
import {
  buildPullRequestIssueText,
  createGitHubClient,
  isPermissionDeniedError,
  type PullRequestEvent
} from "./github.js";

const STEP_SUMMARY_LIMIT_BYTES = 1024 * 1024;
const TRUNCATION_FOOTER =
  "\n\n> FixMap report truncated to fit GitHub's 1 MiB step-summary limit. The complete report remains available through the `report` output.\n";

export type ActionDependencies = {
  appendFile?: (path: string, contents: string) => void;
  buildReport?: typeof buildFixMapReport;
  createClient?: typeof createGitHubClient;
  cwd?: () => string;
  readFile?: (path: string) => string;
  stdout?: (text: string) => void;
  uuid?: () => string;
};

export async function runAction(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: ActionDependencies = {}
): Promise<void> {
  const appendFile = dependencies.appendFile ?? ((path, contents) => appendFileSync(path, contents));
  const readFile = dependencies.readFile ?? ((path) => readFileSync(path, "utf8"));
  const stdout = dependencies.stdout ?? ((text) => process.stdout.write(text));
  const event = readEvent(env.GITHUB_EVENT_PATH, readFile);
  const issue = readInput("issue", env) || buildPullRequestIssueText(event);
  const diffSpec = readInput("diff", env);
  const baseRef = readInput("base", env) || (env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : undefined);
  const headRef = readInput("head", env) || (env.GITHUB_HEAD_REF ? "HEAD" : undefined);
  const format = readInput("format", env) === "json" ? "json" : "markdown";

  if (!issue && !diffSpec && !baseRef) {
    throw new Error("FixMap needs a pull_request event, an issue input, or a diff/base input to build a useful report.");
  }

  const report = await (dependencies.buildReport ?? buildFixMapReport)({
    repoRoot: (dependencies.cwd ?? process.cwd)(),
    issueText: issue,
    diffSpec,
    baseRef,
    headRef
  });
  const markdown = renderMarkdownReport(report);
  const output = format === "json" ? renderJsonReport(report) : markdown;

  stdout(output);

  if (env.GITHUB_STEP_SUMMARY) {
    appendFile(env.GITHUB_STEP_SUMMARY, fitStepSummary(markdown));
  }

  if (env.GITHUB_OUTPUT) {
    appendFile(env.GITHUB_OUTPUT, renderActionOutputs(output, report, dependencies.uuid ?? randomUUID));
  }

  const token = readInput("github-token", env) || env.GITHUB_TOKEN;
  const commentAuthor = readInput("comment-author", env);
  if (token) {
    try {
      await upsertPullRequestComment(token, event, markdown, commentAuthor, env, dependencies.createClient);
    } catch (error) {
      if (!isPermissionDeniedError(error)) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : String(error);
      stdout(
        `::warning::FixMap could not comment on the pull request, which is expected when the token is read-only (for example on forked pull requests). The full report is in the step summary and the report output. ${detail}\n`
      );
    }
  }
}

export function renderActionOutputs(
  reportText: string,
  report: Pick<FixMapReport, "contextFiles" | "testRoutes">,
  uuid: () => string = randomUUID
): string {
  const delimiter = `fixmap_${uuid().replaceAll("-", "")}`;
  const terminatedReport = reportText.endsWith("\n") ? reportText : `${reportText}\n`;
  return [
    `report<<${delimiter}\n`,
    terminatedReport,
    `${delimiter}\n`,
    `context-count=${report.contextFiles.length}\n`,
    `test-route-count=${report.testRoutes.length}\n`
  ].join("");
}

export function fitStepSummary(markdown: string, limitBytes = STEP_SUMMARY_LIMIT_BYTES): string {
  const bytes = Buffer.from(markdown);
  if (bytes.length <= limitBytes) {
    return markdown;
  }

  const footer = Buffer.from(TRUNCATION_FOOTER);
  if (footer.length >= limitBytes) {
    throw new Error("GitHub step-summary limit is too small for the FixMap truncation notice.");
  }

  let end = limitBytes - footer.length;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) {
    end -= 1;
  }
  return `${bytes.subarray(0, end).toString("utf8")}${TRUNCATION_FOOTER}`;
}

function readInput(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const githubName = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const shellSafeName = `INPUT_${name.replace(/[- ]/g, "_").toUpperCase()}`;
  const value = env[githubName] || env[shellSafeName];
  return value?.trim() || undefined;
}

function readEvent(
  eventPath: string | undefined,
  readFile: (path: string) => string
): PullRequestEvent | undefined {
  if (!eventPath) {
    return undefined;
  }

  try {
    return JSON.parse(readFile(eventPath)) as PullRequestEvent;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`FixMap could not read the GitHub event payload: ${detail}`);
  }
}

async function upsertPullRequestComment(
  token: string,
  event: PullRequestEvent | undefined,
  markdown: string,
  commentAuthor: string | undefined,
  env: NodeJS.ProcessEnv,
  createClient: typeof createGitHubClient = createGitHubClient
): Promise<void> {
  if (!event?.pull_request?.number || !env.GITHUB_REPOSITORY) {
    return;
  }

  const [owner, repoName] = env.GITHUB_REPOSITORY.split("/");
  if (!owner || !repoName) {
    throw new Error("FixMap requires GITHUB_REPOSITORY in owner/repository form to comment on a pull request.");
  }

  await createClient().upsertPullRequestComment({
    token,
    owner,
    repo: repoName,
    issueNumber: event.pull_request.number,
    markdown,
    commentAuthor
  });
}
