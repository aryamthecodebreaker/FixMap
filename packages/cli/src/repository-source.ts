import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  buildFixMapReport,
  type FixMapReport,
  type ScanDiagnostic
} from "@aryam/fixmap-core";

const exec = promisify(execFile);
const GIT_MAX_BUFFER = 10 * 1024 * 1024;
const CLONE_TIMEOUT_MS = 120_000;
const ISSUE_FETCH_TIMEOUT_MS = 15_000;
const MAX_GITHUB_API_RESPONSE_CHARS = 1_000_000;
const MAX_GITHUB_ISSUE_BODY_CHARS = 20_000;
const URL_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;
const SCP_STYLE_REMOTE = /^[^\\/@\s]+@[^:]+:/;
const GITHUB_NAME = /^[a-z\d._-]+$/i;

export type RepositoryPlanInput = {
  repo?: string | undefined;
  issueText?: string | undefined;
  diffSpec?: string | undefined;
  baseRef?: string | undefined;
  headRef?: string | undefined;
};

export type ClonedRepository = {
  ref: string;
  revision: string;
};

export type RepositorySourceDependencies = {
  clonePublicRepository?: (
    url: string,
    destination: string,
    hooksDirectory: string
  ) => Promise<ClonedRepository>;
  fetchPublicIssue?: (source: ParsedGitHubIssueSource) => Promise<PublicGitHubIssue>;
  makeTemporaryDirectory?: (prefix: string) => Promise<string>;
  removeTemporaryDirectory?: (path: string) => Promise<void>;
};

export type ParsedRepositorySource =
  | { kind: "local"; repoRoot: string }
  | { kind: "github"; cloneUrl: string; displayUrl: string };

export type ParsedGitHubIssueSource = {
  owner: string;
  repository: string;
  number: number;
  displayUrl: string;
  repositoryUrl: string;
};

export type PublicGitHubIssue = {
  title: string;
  body: string;
};

type ResolvedRepositorySource = {
  kind: "local" | "github";
  repoRoot: string;
  diagnostic?: ScanDiagnostic | undefined;
};

export class RepositorySourceError extends Error {
  override name = "RepositorySourceError";
}

export function parseGitHubIssueSource(input: string): ParsedGitHubIssueSource | undefined {
  const trimmed = input.trim();
  const looksLikeGitHubIssue =
    /^https?:\/\/(?:[^/@\s]+@)?github\.com[\\/]/i.test(trimmed) &&
    /[\\/]issues(?:[\\/]|%(?:2f|5c))/i.test(trimmed);
  if (!looksLikeGitHubIssue) {
    return undefined;
  }
  if (
    /[\u0000-\u001f\u007f]/.test(input) ||
    trimmed.includes("\\") ||
    /%(?:2f|5c)/i.test(trimmed)
  ) {
    throw new RepositorySourceError(
      'GitHub issue URLs must use the canonical form "https://github.com/owner/repository/issues/123".'
    );
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new RepositorySourceError(
      'GitHub issue URLs must use the form "https://github.com/owner/repository/issues/123".'
    );
  }

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new RepositorySourceError(
      'Only canonical public GitHub issue URLs are supported: "https://github.com/owner/repository/issues/123".'
    );
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const owner = segments[0] ?? "";
  const repository = segments[1] ?? "";
  const issueSegment = segments[2] ?? "";
  const rawNumber = segments[3] ?? "";
  const number = Number(rawNumber);
  if (
    segments.length !== 4 ||
    issueSegment.toLowerCase() !== "issues" ||
    !GITHUB_NAME.test(owner) ||
    !GITHUB_NAME.test(repository) ||
    !/^[1-9]\d*$/.test(rawNumber) ||
    !Number.isSafeInteger(number)
  ) {
    throw new RepositorySourceError(
      'GitHub issue URLs must use the form "https://github.com/owner/repository/issues/123".'
    );
  }

  const repositoryUrl = `https://github.com/${owner}/${repository}`;
  return {
    owner,
    repository,
    number,
    displayUrl: `${repositoryUrl}/issues/${number}`,
    repositoryUrl
  };
}

export async function fetchPublicGitHubIssue(
  source: ParsedGitHubIssueSource,
  fetchImplementation: typeof fetch = fetch
): Promise<PublicGitHubIssue> {
  const apiUrl =
    `https://api.github.com/repos/${encodeURIComponent(source.owner)}/` +
    `${encodeURIComponent(source.repository)}/issues/${source.number}`;
  let response: Response;
  try {
    response = await fetchImplementation(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "fixmap-cli",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      redirect: "error",
      signal: AbortSignal.timeout(ISSUE_FETCH_TIMEOUT_MS)
    });
  } catch (error) {
    const timedOut =
      (error as { name?: unknown }).name === "AbortError" ||
      (error as { name?: unknown }).name === "TimeoutError";
    throw new RepositorySourceError(
      `Could not fetch public GitHub issue "${source.displayUrl}": ` +
      (timedOut
        ? `the request exceeded the ${ISSUE_FETCH_TIMEOUT_MS / 1000}-second timeout.`
        : "the GitHub API request failed.")
    );
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new RepositorySourceError(
        `Could not fetch public GitHub issue "${source.displayUrl}": ` +
        "issue was not found or is not publicly accessible."
      );
    }
    if (
      response.status === 403 &&
      response.headers.get("x-ratelimit-remaining") === "0"
    ) {
      throw new RepositorySourceError(
        `Could not fetch public GitHub issue "${source.displayUrl}": ` +
        "GitHub's anonymous API rate limit is exhausted; retry later or paste the issue text directly."
      );
    }
    throw new RepositorySourceError(
      `Could not fetch public GitHub issue "${source.displayUrl}": ` +
      `GitHub API returned HTTP ${response.status}.`
    );
  }

  const rawPayload = await response.text();
  if (rawPayload.length > MAX_GITHUB_API_RESPONSE_CHARS) {
    throw new RepositorySourceError(
      `Could not fetch public GitHub issue "${source.displayUrl}": ` +
      "GitHub API response exceeded the safe size limit."
    );
  }

  let payload: {
    title?: unknown;
    body?: unknown;
    pull_request?: unknown;
  };
  try {
    payload = JSON.parse(rawPayload) as typeof payload;
  } catch {
    throw new RepositorySourceError(
      `Could not fetch public GitHub issue "${source.displayUrl}": ` +
      "GitHub API returned an invalid response."
    );
  }
  if (payload.pull_request) {
    throw new RepositorySourceError(
      `"${source.displayUrl}" resolves to a pull request, not an issue. ` +
      "Use --diff on a local checkout or paste the pull request description."
    );
  }
  if (typeof payload.title !== "string" || !payload.title.trim()) {
    throw new RepositorySourceError(
      `Could not fetch public GitHub issue "${source.displayUrl}": ` +
      "GitHub API response did not include an issue title."
    );
  }

  return {
    title: payload.title.trim(),
    body: typeof payload.body === "string" ? payload.body.trim() : ""
  };
}

export function buildIsolatedGitEnvironment(
  inheritedEnvironment: NodeJS.ProcessEnv,
  homeDirectory: string,
  gitConfigPath: string
): NodeJS.ProcessEnv {
  const blockedEnvironmentNames = new Set([
    "GCM_INTERACTIVE",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "HOME",
    "SSH_ASKPASS",
    "SSH_ASKPASS_REQUIRE",
    "SUDO_ASKPASS",
    "USERPROFILE",
    "XDG_CONFIG_HOME"
  ]);
  const sanitizedEnvironment = Object.fromEntries(
    Object.entries(inheritedEnvironment).filter(([name]) => {
      const uppercaseName = name.toUpperCase();
      return !uppercaseName.startsWith("GIT_") &&
        !blockedEnvironmentNames.has(uppercaseName);
    })
  );

  return {
    ...sanitizedEnvironment,
    GCM_INTERACTIVE: "Never",
    GIT_CONFIG_GLOBAL: gitConfigPath,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_LFS_SKIP_SMUDGE: "1",
    GIT_TERMINAL_PROMPT: "0",
    HOME: homeDirectory,
    USERPROFILE: homeDirectory,
    XDG_CONFIG_HOME: homeDirectory
  };
}

export function parseRepositorySource(input: string): ParsedRepositorySource {
  const trimmed = input.trim();
  const looksLikeUrl = URL_SCHEME.test(trimmed) || SCP_STYLE_REMOTE.test(trimmed);

  if (!looksLikeUrl) {
    if (/^github\.com[\\/]/i.test(trimmed)) {
      throw new RepositorySourceError(
        `GitHub repository URLs must start with "https://". Try "https://${trimmed.replaceAll("\\", "/")}".`
      );
    }
    return { kind: "local", repoRoot: resolve(input) };
  }
  if (
    /[\u0000-\u001f\u007f]/.test(input) ||
    trimmed.includes("\\") ||
    /%(?:2f|5c)/i.test(trimmed)
  ) {
    throw new RepositorySourceError(
      'Repository URLs must use the canonical form "https://github.com/owner/repository".'
    );
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new RepositorySourceError(
      'Repository URLs must use the form "https://github.com/owner/repository".'
    );
  }

  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.port) {
    throw new RepositorySourceError(
      'Only public HTTPS GitHub URLs are supported: "https://github.com/owner/repository".'
    );
  }
  if (url.username || url.password) {
    throw new RepositorySourceError(
      "GitHub repository URLs must not contain credentials. Use the public HTTPS URL instead."
    );
  }
  if (url.search || url.hash) {
    throw new RepositorySourceError(
      "GitHub repository URLs must not contain query parameters or fragments."
    );
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) {
    throw new RepositorySourceError(
      "The GitHub URL must identify one repository. Branch, file, and subdirectory URLs are not supported."
    );
  }

  const owner = segments[0] ?? "";
  const rawRepository = segments[1] ?? "";
  const repository = rawRepository.toLowerCase().endsWith(".git")
    ? rawRepository.slice(0, -4)
    : rawRepository;
  if (!GITHUB_NAME.test(owner) || !GITHUB_NAME.test(repository)) {
    throw new RepositorySourceError(
      'Repository URLs must use the form "https://github.com/owner/repository".'
    );
  }

  const displayUrl = `https://github.com/${owner}/${repository}`;
  return {
    kind: "github",
    displayUrl,
    cloneUrl: `${displayUrl}.git`
  };
}

export async function buildReportForRepository(
  input: RepositoryPlanInput,
  dependencies: RepositorySourceDependencies = {}
): Promise<FixMapReport> {
  const issueSource = input.issueText
    ? parseGitHubIssueSource(input.issueText)
    : undefined;
  const repoInput = input.repo ?? issueSource?.repositoryUrl ?? process.cwd();
  const source = parseRepositorySource(repoInput);
  if (
    issueSource &&
    source.kind === "github" &&
    source.displayUrl.toLowerCase() !== issueSource.repositoryUrl.toLowerCase()
  ) {
    throw new RepositorySourceError(
      `GitHub issue "${issueSource.displayUrl}" belongs to ${issueSource.repositoryUrl}, ` +
      `but --repo points to ${source.displayUrl}. Remove --repo or use the matching repository.`
    );
  }
  if (
    source.kind === "github" &&
    (input.diffSpec !== undefined || input.baseRef !== undefined || input.headRef !== undefined)
  ) {
    throw new RepositorySourceError(
      "Git diff options are not supported with a temporary GitHub URL checkout yet. " +
      "Use --issue only, or clone the repository locally before using --diff, --base, or --head."
    );
  }

  let issueText = input.issueText;
  let issueDiagnostic: ScanDiagnostic | undefined;
  if (issueSource) {
    const fetchPublicIssue = dependencies.fetchPublicIssue ?? fetchPublicGitHubIssue;
    const issue = await fetchPublicIssue(issueSource);
    const truncated = issue.body.length > MAX_GITHUB_ISSUE_BODY_CHARS;
    const body = issue.body.slice(0, MAX_GITHUB_ISSUE_BODY_CHARS);
    issueText = [issue.title, body].filter(Boolean).join("\n\n");
    issueDiagnostic = {
      code: "remote-issue-fetched",
      severity: "info",
      message:
        `Fetched ${issueSource.displayUrl} anonymously and used its title` +
        (body ? " and body" : "") +
        " as task context" +
        (truncated
          ? `; the body was truncated to ${MAX_GITHUB_ISSUE_BODY_CHARS.toLocaleString("en-US")} characters.`
          : ".")
    };
  }

  return withRepositorySource(source, async (resolvedSource) => {
    const report = await buildFixMapReport({
      repoRoot: resolvedSource.repoRoot,
      issueText,
      diffSpec: input.diffSpec,
      baseRef: input.baseRef,
      headRef: input.headRef
    });
    const sourceDiagnostics = [issueDiagnostic, resolvedSource.diagnostic].filter(
      (diagnostic): diagnostic is ScanDiagnostic => diagnostic !== undefined
    );
    report.diagnostics.unshift(...sourceDiagnostics);
    return report;
  }, dependencies);
}

export async function withRepositorySource<T>(
  source: ParsedRepositorySource,
  work: (source: ResolvedRepositorySource) => Promise<T>,
  dependencies: RepositorySourceDependencies = {}
): Promise<T> {
  if (source.kind === "local") {
    if (!(await isDirectory(source.repoRoot))) {
      throw new RepositorySourceError(
        `Repository root "${source.repoRoot}" does not exist or is not a directory.`
      );
    }
    return work({ kind: "local", repoRoot: source.repoRoot });
  }

  const makeTemporaryDirectory = dependencies.makeTemporaryDirectory ?? mkdtemp;
  const removeTemporaryDirectory = dependencies.removeTemporaryDirectory ??
    ((path: string) => rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));
  const clonePublicRepository = dependencies.clonePublicRepository ?? defaultClonePublicRepository;
  const temporaryRoot = await makeTemporaryDirectory(join(tmpdir(), "fixmap-github-"));
  const checkoutRoot = join(temporaryRoot, "repository");
  const hooksDirectory = join(temporaryRoot, "disabled-hooks");
  let primaryError: unknown;

  try {
    await mkdir(hooksDirectory, { recursive: true });

    let cloned: ClonedRepository;
    try {
      cloned = await clonePublicRepository(source.cloneUrl, checkoutRoot, hooksDirectory);
    } catch (error) {
      throw new RepositorySourceError(
        `Could not fetch public GitHub repository "${source.displayUrl}": ${errorDetail(error)}.`
      );
    }

    const diagnostic: ScanDiagnostic = {
      code: "remote-repo-fetched",
      severity: "info",
      message:
        `Fetched ${source.displayUrl} at ${cloned.ref}@${cloned.revision} into an isolated ` +
        "temporary checkout; no repository hooks or scripts were run, and the checkout was removed after analysis."
    };

    return await work({
      kind: "github",
      repoRoot: checkoutRoot,
      diagnostic
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await removeTemporaryDirectory(temporaryRoot);
    } catch (cleanupError) {
      const cleanupMessage =
        `Could not remove temporary checkout "${temporaryRoot}": ${errorDetail(cleanupError)}.`;
      if (primaryError instanceof Error) {
        throw new RepositorySourceError(`${primaryError.message} ${cleanupMessage}`);
      }
      throw new RepositorySourceError(cleanupMessage);
    }
  }
}

async function defaultClonePublicRepository(
  url: string,
  destination: string,
  hooksDirectory: string
): Promise<ClonedRepository> {
  const isolationRoot = dirname(hooksDirectory);
  const homeDirectory = join(isolationRoot, "isolated-home");
  const templateDirectory = join(isolationRoot, "empty-template");
  const gitConfigPath = join(isolationRoot, "empty-gitconfig");
  await Promise.all([
    mkdir(homeDirectory, { recursive: true }),
    mkdir(templateDirectory, { recursive: true }),
    writeFile(gitConfigPath, "", "utf8")
  ]);

  const gitEnvironment = buildIsolatedGitEnvironment(
    process.env,
    homeDirectory,
    gitConfigPath
  );
  const commonOptions = {
    env: gitEnvironment,
    maxBuffer: GIT_MAX_BUFFER,
    timeout: CLONE_TIMEOUT_MS,
    windowsHide: true
  };

  await exec(
    "git",
    [
      "-c", "credential.helper=",
      "-c", "http.extraHeader=",
      "-c", "http.sslVerify=true",
      "-c", `core.hooksPath=${hooksDirectory}`,
      "-c", "protocol.allow=never",
      "-c", "protocol.https.allow=always",
      "clone",
      "--quiet",
      "--depth", "1",
      "--single-branch",
      "--no-tags",
      "--no-recurse-submodules",
      `--template=${templateDirectory}`,
      "--config", "credential.helper=",
      "--config", "http.extraHeader=",
      "--config", `core.hooksPath=${hooksDirectory}`,
      "--config", "core.fsmonitor=false",
      "--config", "core.symlinks=false",
      "--config", "filter.lfs.smudge=",
      "--config", "filter.lfs.required=false",
      "--",
      url,
      destination
    ],
    commonOptions
  );

  const { stdout: revisionOutput } = await exec(
    "git",
    ["-C", destination, "rev-parse", "--verify", "HEAD"],
    commonOptions
  );
  let ref = "HEAD";
  try {
    const { stdout: refOutput } = await exec(
      "git",
      ["-C", destination, "symbolic-ref", "--short", "HEAD"],
      commonOptions
    );
    ref = refOutput.trim() || ref;
  } catch {
    // Detached default branches are valid; the commit still identifies the fetched source.
  }

  return {
    ref,
    revision: revisionOutput.trim()
  };
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function errorDetail(error: unknown): string {
  const candidate = error as {
    code?: unknown;
    killed?: unknown;
    message?: unknown;
    stderr?: unknown;
  };
  if (candidate.code === "ENOENT") {
    return "Git is not installed or is not available on PATH";
  }
  if (candidate.killed === true || candidate.code === "ETIMEDOUT") {
    return `the clone exceeded the ${CLONE_TIMEOUT_MS / 1000}-second timeout`;
  }

  const stderr = typeof candidate.stderr === "string" ? candidate.stderr : "";
  const message = typeof candidate.message === "string" ? candidate.message : String(error);
  const detail = stderr.split(/\r?\n/).find((line) => line.trim()) ?? message.split(/\r?\n/)[0] ?? "unknown error";
  const normalized = detail.trim().replace(/\s+/g, " ");
  if (
    /repository not found/i.test(normalized) ||
    /authentication failed/i.test(normalized) ||
    /terminal prompts disabled/i.test(normalized)
  ) {
    return "repository was not found or is not publicly accessible";
  }
  if (/needed a single revision/i.test(normalized) || /unknown revision.*head/i.test(normalized)) {
    return "repository has no default-branch commit to analyze";
  }
  return normalized;
}
