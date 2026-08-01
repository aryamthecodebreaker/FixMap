import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import {
  buildFixMapReport,
  renderJsonReport,
  renderMarkdownReport,
  renderVerifyMarkdown,
  scanRepo,
  verifyPlan,
  type FixMapReport,
  type VerifyResult
} from "@aryam/fixmap-core";
import {
  buildPullRequestIssueText,
  createGitHubClient,
  isPermissionDeniedError,
  type PullRequestEvent
} from "./github.js";
import {
  fetchActionIssue,
  parseActionIssueSource,
  type ActionIssueSource,
  type ActionIssue
} from "./issue-source.js";

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
  fetchIssue?: (source: ActionIssueSource) => Promise<ActionIssue>;
  scanRepo?: typeof scanRepo;
};

export async function runAction(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: ActionDependencies = {}
): Promise<void> {
  const appendFile = dependencies.appendFile ?? ((path, contents) => appendFileSync(path, contents));
  const readFile = dependencies.readFile ?? ((path) => readFileSync(path, "utf8"));
  const stdout = dependencies.stdout ?? ((text) => process.stdout.write(text));
  const event = readEvent(env.GITHUB_EVENT_PATH, readFile);
  const rawIssue = readInput("issue", env) || buildPullRequestIssueText(event);
  const diffSpec = readInput("diff", env);
  const workingTree = parseBooleanInput("working-tree", readInput("working-tree", env));
  const includeUntracked = parseBooleanInput("include-untracked", readInput("include-untracked", env));
  const baseRef = readInput("base", env) || (!workingTree && env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : undefined);
  const headRef = readInput("head", env) || (!workingTree && env.GITHUB_HEAD_REF ? "HEAD" : undefined);
  const format = parseFormat(readInput("format", env));
  const mode = parseMode(readInput("mode", env));
  const exclude = (readInput("exclude", env) ?? "").split(/[\r\n,]+/).map((value) => value.trim()).filter(Boolean);
  const limit = parseLimit(readInput("limit", env));
  if (includeUntracked && !workingTree) throw new Error("include-untracked requires working-tree.");
  if (workingTree && (diffSpec || baseRef || headRef)) throw new Error("Use either working-tree or diff/base/head, not both.");
  if (diffSpec && (baseRef || headRef)) throw new Error("Use either diff or base/head, not both.");

  // Verify closes the plan-edit-verify loop for workflows that never touch the CLI or MCP:
  // a first job saves the plan as an artifact, a later run on `synchronize` checks the
  // pushed commits against it.
  if (mode === "verify") {
    return runVerifyMode({ env, dependencies, readFile, appendFile, stdout, format, diffSpec, baseRef, headRef, workingTree, includeUntracked });
  }

  const issueSource = rawIssue ? parseActionIssueSource(rawIssue) : undefined;
  if (issueSource && env.GITHUB_REPOSITORY &&
    env.GITHUB_REPOSITORY.toLowerCase() !== `${issueSource.owner}/${issueSource.repository}`.toLowerCase()) {
    throw new Error(
      `Issue ${issueSource.displayUrl} belongs to ${issueSource.owner}/${issueSource.repository}, ` +
      `but this Action is scanning ${env.GITHUB_REPOSITORY}.`
    );
  }
  const fetchedIssue = issueSource
    ? await (dependencies.fetchIssue ?? fetchActionIssue)(issueSource)
    : undefined;
  const issue = fetchedIssue
    ? [fetchedIssue.title, fetchedIssue.body].filter(Boolean).join("\n\n")
    : rawIssue;

  if (!issue && !diffSpec && !baseRef && !workingTree) {
    throw new Error("FixMap needs a pull_request event, an issue input, or a diff/base input to build a useful report.");
  }

  const report = await (dependencies.buildReport ?? buildFixMapReport)({
    repoRoot: (dependencies.cwd ?? process.cwd)(),
    issueText: issue,
    diffSpec,
    baseRef,
    headRef,
    workingTree,
    includeUntracked,
    limit,
    exclude
  });
  if (issueSource) {
    report.diagnostics.unshift({
      code: issueSource.isPullRequest ? "remote-pull-fetched" : "remote-issue-fetched",
      severity: "info",
      message: `Fetched ${issueSource.displayUrl} anonymously and used its title${fetchedIssue?.body ? " and body" : ""} as task context.`
    });
  }
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
      const comment = format === "json" ? `\`\`\`json\n${output.trimEnd()}\n\`\`\`\n` : markdown;
      await upsertPullRequestComment(token, event, comment, commentAuthor, env, dependencies.createClient);
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

function parseMode(value: string | undefined): "plan" | "verify" {
  if (!value) {
    return "plan";
  }
  const normalized = value.toLowerCase();
  if (normalized === "plan" || normalized === "verify") {
    return normalized;
  }
  throw new Error(`Invalid mode input ${JSON.stringify(value)}; expected plan or verify.`);
}

type VerifyModeContext = {
  env: NodeJS.ProcessEnv;
  dependencies: ActionDependencies;
  readFile: (path: string) => string;
  appendFile: (path: string, contents: string) => void;
  stdout: (text: string) => void;
  format: "markdown" | "json";
  diffSpec: string | undefined;
  baseRef: string | undefined;
  headRef: string | undefined;
  workingTree: boolean;
  includeUntracked: boolean;
};

async function runVerifyMode(context: VerifyModeContext): Promise<void> {
  const reportPath = readInput("report-path", context.env);
  if (!reportPath) {
    throw new Error(
      "FixMap verify mode needs report-path pointing at the JSON plan this change was made from. " +
      "Save one with a prior plan step using format: json, then download it as an artifact."
    );
  }
  if (!context.diffSpec && !context.baseRef && !context.workingTree) {
    throw new Error("FixMap verify mode needs diff, base/head, or working-tree so it can see what changed.");
  }

  let report: FixMapReport;
  try {
    report = JSON.parse(context.readFile(reportPath)) as FixMapReport;
  } catch (error) {
    throw new Error(
      `FixMap could not read the plan at "${reportPath}": ${error instanceof Error ? error.message : String(error)}.`
    );
  }
  if (!Array.isArray(report.contextFiles)) {
    throw new Error(`"${reportPath}" is not a FixMap JSON report: no contextFiles array.`);
  }

  const repo = await (context.dependencies.scanRepo ?? scanRepo)({
    repoRoot: (context.dependencies.cwd ?? process.cwd)(),
    diffSpec: context.diffSpec,
    baseRef: context.baseRef,
    headRef: context.headRef,
    workingTree: context.workingTree,
    includeUntracked: context.includeUntracked
  });
  const diffFailure = repo.diagnostics.find((diagnostic) => diagnostic.code === "diff-unavailable");
  if (diffFailure) {
    throw new Error(`${diffFailure.message} Verification needs a resolvable diff.`);
  }

  const result = verifyPlan(report, repo);
  const markdown = renderVerifyMarkdown(result);
  const output = context.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : markdown;

  context.stdout(output);

  if (context.env.GITHUB_STEP_SUMMARY) {
    context.appendFile(context.env.GITHUB_STEP_SUMMARY, fitStepSummary(markdown));
  }
  if (context.env.GITHUB_OUTPUT) {
    context.appendFile(
      context.env.GITHUB_OUTPUT,
      renderVerifyOutputs(output, result, context.dependencies.uuid ?? randomUUID)
    );
  }

  // A generated-location edit is discarded by the next build, so it fails the step rather
  // than being reported and scrolled past. Everything else stays advisory.
  if (result.findings.some((finding) => finding.severity === "error")) {
    throw new Error(
      "FixMap verification found an edit in a generated or retired location, which the next build discards."
    );
  }
}

export function renderVerifyOutputs(
  reportText: string,
  result: VerifyResult,
  uuid: () => string = randomUUID
): string {
  const delimiter = `fixmap_${uuid().replaceAll("-", "")}`;
  const terminated = reportText.endsWith("\n") ? reportText : `${reportText}\n`;
  return [
    `report<<${delimiter}\n`,
    terminated,
    `${delimiter}\n`,
    `finding-count=${result.findings.length}\n`,
    `changed-file-count=${result.changedFiles.length}\n`
  ].join("");
}

function parseFormat(value: string | undefined): "markdown" | "json" {
  if (!value) {
    return "markdown";
  }
  const normalized = value.toLowerCase();
  if (normalized === "markdown" || normalized === "json") {
    return normalized;
  }
  throw new Error(`Invalid format input ${JSON.stringify(value)}; expected markdown or json.`);
}

function parseLimit(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 20) throw new Error("limit must be a whole number from 1 to 20.");
  return parsed;
}

function parseBooleanInput(name: string, value: string | undefined): boolean {
  if (!value) return false;
  if (/^(?:true|1|yes)$/i.test(value)) return true;
  if (/^(?:false|0|no)$/i.test(value)) return false;
  throw new Error(`${name} must be true or false.`);
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
