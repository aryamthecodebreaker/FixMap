export type ActionIssueSource = {
  owner: string;
  repository: string;
  number: number;
  displayUrl: string;
};

export type ActionIssue = { title: string; body: string };

export function parseActionIssueSource(input: string): ActionIssueSource | undefined {
  const trimmed = input.trim();
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
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.search ||
    url.hash ||
    segments.length !== 4 ||
    segments[2]?.toLowerCase() !== "issues" ||
    !segments[0] ||
    !segments[1] ||
    !/^[1-9]\d*$/.test(segments[3] ?? "") ||
    !Number.isSafeInteger(number)
  ) {
    throw new Error(
      "Only canonical public GitHub issue URLs are supported. Pull request, discussion, compare, tree, and file URLs are not fetched."
    );
  }
  return {
    owner: segments[0],
    repository: segments[1],
    number,
    displayUrl: `https://github.com/${segments[0]}/${segments[1]}/issues/${number}`
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
    throw new Error(`Could not fetch public GitHub issue ${source.displayUrl}: GitHub returned HTTP ${response.status}.`);
  }
  const payload = await response.json() as { title?: unknown; body?: unknown; pull_request?: unknown };
  if (payload.pull_request || typeof payload.title !== "string" || !payload.title.trim()) {
    throw new Error(`Could not fetch public GitHub issue ${source.displayUrl}: the response was not an issue.`);
  }
  return {
    title: payload.title.trim(),
    body: typeof payload.body === "string" ? payload.body.trim().slice(0, 20_000) : ""
  };
}
