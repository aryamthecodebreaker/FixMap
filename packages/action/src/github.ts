export const FIXMAP_REPORT_MARKER = "<!-- fixmap-report -->";
export const DEFAULT_COMMENT_AUTHOR = "github-actions[bot]";

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
        input.commentAuthor?.trim() || DEFAULT_COMMENT_AUTHOR
      );
      const body = `${FIXMAP_REPORT_MARKER}\n${input.markdown}`;

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
  viewerLogin: string
): Promise<GitHubComment | undefined> {
  for (let page = 1; page <= 10; page += 1) {
    const comments = await requestJson<GitHubComment[]>(
      fetchImpl,
      `${commentsUrl}?per_page=100&page=${page}`,
      { headers },
      "list pull request comments"
    );
    const existing = comments.find(
      (comment) => comment.user?.login === viewerLogin && comment.body?.includes(FIXMAP_REPORT_MARKER)
    );
    if (existing) {
      return existing;
    }

    if (comments.length < 100) {
      return undefined;
    }
  }

  return undefined;
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
    throw new Error(`FixMap could not ${action}; GitHub returned ${response.status} ${response.statusText}${suffix}`);
  }

  return response.json() as Promise<T>;
}
