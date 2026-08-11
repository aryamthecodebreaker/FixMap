export const FIXMAP_REPORT_MARKER = "<!-- fixmap-report -->";

/**
 * GitHub rejects an issue comment over 65,536 characters with a 422, and the marker was
 * concatenated onto the report and posted without any check — so on a large monorepo the run
 * completed, ranked everything, and then failed at the final API call, losing the report.
 * Truncating keeps the comment and points readers to a local `--output` run for the complete
 * artifact; no bounded GitHub surface is described as complete.
 */
export const MAX_COMMENT_BODY_CHARS = 65_536;

const COMMENT_TRUNCATION_FOOTER =
  "\n\n> Report truncated to fit GitHub's comment size limit. " +
  "Run FixMap locally with `--output` to retain a complete report.\n";

export function fitCommentBody(body: string, limit = MAX_COMMENT_BODY_CHARS): string {
  if (body.length <= limit) return body;

  // Closing an open fence adds four characters, so reserve them before the cut.
  const keep = Math.max(0, limit - COMMENT_TRUNCATION_FOOTER.length - "\n```".length);
  const cut = body.slice(0, keep);
  // Cutting mid-fence leaves an unterminated block that swallows the footer explaining the
  // truncation, so fall back to the last paragraph break and close any fence left open.
  const lastBreak = cut.lastIndexOf("\n\n");
  const trimmed = lastBreak > keep / 2 ? cut.slice(0, lastBreak) : cut;
  const fenceCount = (trimmed.match(/^```/gm) ?? []).length;
  const closed = fenceCount % 2 === 0 ? trimmed : `${trimmed}\n\`\`\``;
  return `${closed}${COMMENT_TRUNCATION_FOOTER}`;
}

export type PullRequestEvent = {
  pull_request?: {
    number?: number;
    title?: string;
    body?: string | null;
  };
};

type GitHubComment = {
  id: number;
  body?: string | null;
  user?: { login?: string | null } | null;
};

type GitHubClientOptions = {
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
};

export function buildPullRequestIssueText(event: PullRequestEvent | undefined): string {
  const pullRequest = event?.pull_request;
  const parts = [pullRequest?.title, pullRequest?.body]
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => part.trim());

  return parts.join("\n\n");
}

export function createGitHubClient(options: GitHubClientOptions = {}) {
  const apiBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async upsertPullRequestComment(input: {
      token: string;
      owner: string;
      repo: string;
      issueNumber: number;
      markdown: string;
      commentAuthor?: string | undefined;
    }): Promise<"created" | "updated"> {
      const headers = {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${input.token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28"
      };
      const commentsUrl = `${apiBaseUrl}/repos/${input.owner}/${input.repo}/issues/${input.issueNumber}/comments`;
      const existing = await findExistingComment(
        fetchImpl,
        commentsUrl,
        headers,
        input.commentAuthor?.trim()
      );
      const body = fitCommentBody(`${FIXMAP_REPORT_MARKER}\n${input.markdown}`);

      if (existing) {
        await requestJson(fetchImpl, `${apiBaseUrl}/repos/${input.owner}/${input.repo}/issues/comments/${existing.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ body })
        }, "update the existing FixMap comment");
        return "updated";
      }

      await requestJson(fetchImpl, commentsUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ body })
      }, "create the FixMap comment");
      return "created";
    }
  };
}

async function findExistingComment(
  fetchImpl: typeof fetch,
  commentsUrl: string,
  headers: Record<string, string>,
  commentAuthor: string | undefined
): Promise<GitHubComment | undefined> {
  const maxPages = 50;
  let latest: GitHubComment | undefined;
  for (let page = 1; page <= maxPages; page += 1) {
    const comments = await requestJson<GitHubComment[]>(
      fetchImpl,
      `${commentsUrl}?per_page=100&page=${page}`,
      { headers },
      "list pull request comments"
    );
    const match = comments.filter(
      (comment) =>
        comment.body?.includes(FIXMAP_REPORT_MARKER) &&
        // GitHub logins are case-insensitive, so a config saying "github-actions[bot]" did
        // not match a comment authored by "GitHub-Actions[bot]" and the Action posted a
        // second comment beside the one it meant to update.
        (!commentAuthor || comment.user?.login?.toLowerCase() === commentAuthor.toLowerCase())
    ).sort((left, right) => right.id - left.id)[0];
    if (match && (!latest || match.id > latest.id)) latest = match;

    if (comments.length < 100) {
      return latest;
    }
  }
  if (latest) return latest;
  throw new Error(
    "FixMap stopped after searching 5,000 pull request comments without finding its marker; " +
    "it refused to create a duplicate comment. Remove old comments or set comment-author to narrow the search."
  );
}

export function isPermissionDeniedError(error: unknown): boolean {
  return error instanceof GitHubRequestError && (
    error.status === 401 ||
    error.status === 404 ||
    (error.status === 403 && !error.rateLimited && /resource not accessible|insufficient permission|forbidden|write access/i.test(error.detail))
  );
}

export class GitHubRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string,
    readonly rateLimited: boolean
  ) {
    super(message);
    this.name = "GitHubRequestError";
  }
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  action: string
): Promise<T> {
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 500);
    const suffix = detail ? `: ${detail}` : "";
    const rateLimited = response.status === 429 ||
      response.headers.get("x-ratelimit-remaining") === "0" ||
      /secondary rate limit|rate limit exceeded/i.test(detail);
    throw new GitHubRequestError(
      `FixMap could not ${action}; GitHub returned ${response.status} ${response.statusText}${suffix}`,
      response.status,
      detail,
      rateLimited
    );
  }

  return response.json() as Promise<T>;
}
