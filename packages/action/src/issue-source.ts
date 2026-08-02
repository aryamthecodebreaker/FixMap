export type ActionIssueSource = {
  owner: string;
  repository: string;
  number: number;
  displayUrl: string;
  /** True for a /pull/N URL. GitHub serves both from the same endpoint. */
  isPullRequest: boolean;
};

export type ActionIssue = { title: string; body: string; truncated: boolean };

const MAX_API_RESPONSE_CHARS = 1_000_000;
const MAX_ISSUE_BODY_CHARS = 20_000;

export function parseActionIssueSource(input: string): ActionIssueSource | undefined {
  const trimmed = input.trim();
  // A credentialed URL failed the bare `^https://github.com/` test and fell through as prose,
  // so a token pasted into the input was ranked as task text and echoed into the step summary
  // and the pull request comment. Anything addressing github.com is claimed here and refused
  // loudly instead — treating it as free text is the one outcome that leaks it.
  if (/^https?:\/\/[^/\s]*@github\.com\//i.test(trimmed)) {
    throw new Error(
      "The issue URL contains credentials. Remove the user:token@ prefix and pass the public " +
      "https://github.com/owner/repository/issues/123 URL; the Action reads public issues anonymously."
    );
  }
  if (!/^https?:\/\/github\.com\//i.test(trimmed)) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("GitHub issue input must use https://github.com/owner/repository/issues/123.");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const number = Number(segments[3]);
  const kind = segments[2]?.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.search ||
    url.hash ||
    segments.length !== 4 ||
    (kind !== "issues" && kind !== "pull") ||
    !segments[0] ||
    !segments[1] ||
    !/^[1-9]\d*$/.test(segments[3] ?? "") ||
    !Number.isSafeInteger(number)
  ) {
    throw new Error(
      "Only canonical public GitHub issue and pull request URLs are supported. " +
      "Discussion, compare, tree, and file URLs are not fetched."
    );
  }
  const isPullRequest = kind === "pull";
  return {
    owner: segments[0],
    repository: segments[1],
    number,
    isPullRequest,
    displayUrl: `https://github.com/${segments[0]}/${segments[1]}/${isPullRequest ? "pull" : "issues"}/${number}`
  };
}

export async function fetchActionIssue(source: ActionIssueSource): Promise<ActionIssue> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}/issues/${source.number}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "fixmap-action",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000)
    }
  );
  if (!response.ok) {
    // The CLI already distinguishes these three, and the Action reads public issues
    // anonymously from a shared runner IP — so an exhausted rate limit is the failure it hits
    // most, and "HTTP 403" is the least useful thing to print about it.
    if (response.status === 404) {
      throw new Error(
        `Could not fetch public GitHub issue ${source.displayUrl}: it was not found or is not publicly accessible.`
      );
    }
    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      const resetAt = Number(response.headers.get("x-ratelimit-reset"));
      const resets = Number.isSafeInteger(resetAt) && resetAt > 0
        ? ` The limit resets at ${new Date(resetAt * 1000).toISOString()}.`
        : "";
      throw new Error(
        `Could not fetch public GitHub issue ${source.displayUrl}: GitHub's anonymous API rate limit is ` +
        `exhausted for this runner.${resets} Pass the issue text directly, or retry later.`
      );
    }
    throw new Error(`Could not fetch public GitHub issue ${source.displayUrl}: GitHub returned HTTP ${response.status}.`);
  }

  // `response.json()` buffers whatever arrives. The CLI caps this; the Action did not, so a
  // pathological response could exhaust the runner before any of it was parsed.
  const rawPayload = await response.text();
  if (rawPayload.length > MAX_API_RESPONSE_CHARS) {
    throw new Error(
      `Could not fetch public GitHub issue ${source.displayUrl}: the API response exceeded the safe size limit.`
    );
  }
  let payload: { title?: unknown; body?: unknown; pull_request?: unknown };
  try {
    payload = JSON.parse(rawPayload) as typeof payload;
  } catch {
    throw new Error(`Could not fetch public GitHub issue ${source.displayUrl}: GitHub returned an invalid response.`);
  }
  if (payload.pull_request && !source.isPullRequest) {
    throw new Error(
      `${source.displayUrl} resolves to a pull request, not an issue. ` +
      `Use https://github.com/${source.owner}/${source.repository}/pull/${source.number} instead.`
    );
  }
  if (typeof payload.title !== "string" || !payload.title.trim()) {
    throw new Error(`Could not fetch public GitHub issue ${source.displayUrl}: the response was not an issue.`);
  }
  // Silently cutting a body at 20k made a long issue rank on half its text with nothing on
  // the report to say so. The cap stays; the caller can now report it.
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  return {
    title: payload.title.trim(),
    body: body.slice(0, MAX_ISSUE_BODY_CHARS),
    truncated: body.length > MAX_ISSUE_BODY_CHARS
  };
}
