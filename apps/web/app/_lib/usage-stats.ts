/**
 * Public usage numbers for the homepage, read from npm's and GitHub's public APIs on the
 * server. FixMap itself sends no telemetry; these counts are downloads, not users.
 */
export const USAGE_PACKAGE = "@aryam/fixmap";
/** First npm publish of @aryam/fixmap. */
export const USAGE_FIRST_PUBLISHED = "2026-07-10";
export const USAGE_REPOSITORY = "aryamthecodebreaker/FixMap";
/** Seconds between refreshes; shared with the page's revalidation. */
export const USAGE_REFRESH_SECONDS = 300;

export type UsageStats = {
  lastWeek: number;
  lastMonth: number;
  sinceLaunch: number;
  stars: number | null;
  fetchedAt: string;
  /** Last day npm has counted (YYYY-MM-DD); npm publishes once a day, so this is usually yesterday. */
  countsThrough: string;
};

type FetchLike = (url: string, init?: RequestInit & { next?: { revalidate?: number } }) => Promise<Pick<Response, "ok" | "json">>;

const DAY_MS = 86_400_000;
// npm's range endpoint serves at most 18 months per request; stay well inside it.
const RANGE_CHUNK_DAYS = 365;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

async function getJson(fetchImpl: FetchLike, url: string): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
    next: { revalidate: USAGE_REFRESH_SECONDS }
  });
  if (!response.ok) throw new Error("usage source unavailable");
  return response.json();
}

function downloadCount(body: unknown): number {
  const downloads = (body as { downloads?: unknown } | null)?.downloads;
  if (typeof downloads !== "number" || !Number.isSafeInteger(downloads) || downloads < 0) throw new Error("invalid download count");
  return downloads;
}

function countsThrough(body: unknown): string {
  const end = (body as { end?: unknown } | null)?.end;
  if (typeof end !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error("invalid download window");
  return end;
}

function rangeTotal(body: unknown): number {
  const downloads = (body as { downloads?: unknown } | null)?.downloads;
  if (!Array.isArray(downloads)) throw new Error("invalid download range");
  return downloads.reduce((total: number, day: unknown) => {
    const value = (day as { downloads?: unknown } | null)?.downloads;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("invalid download day");
    return total + value;
  }, 0);
}

/** Returns null when npm cannot be read, so the page can say so instead of showing a wrong number. */
export async function loadUsageStats(fetchImpl: FetchLike = fetch, now = new Date()): Promise<UsageStats | null> {
  // npm's downloads API expects the scoped name with a literal slash.
  const encoded = USAGE_PACKAGE;
  try {
    const start = new Date(`${USAGE_FIRST_PUBLISHED}T00:00:00Z`);
    const ranges: string[] = [];
    for (let from = start; from <= now; from = new Date(from.getTime() + RANGE_CHUNK_DAYS * DAY_MS)) {
      const to = new Date(Math.min(from.getTime() + (RANGE_CHUNK_DAYS - 1) * DAY_MS, now.getTime()));
      ranges.push(`${isoDay(from)}:${isoDay(to)}`);
    }
    const [week, month, ...chunks] = await Promise.all([
      getJson(fetchImpl, `https://api.npmjs.org/downloads/point/last-week/${encoded}`),
      getJson(fetchImpl, `https://api.npmjs.org/downloads/point/last-month/${encoded}`),
      ...ranges.map((range) => getJson(fetchImpl, `https://api.npmjs.org/downloads/range/${range}/${encoded}`))
    ]);
    let stars: number | null = null;
    try {
      const repository = await getJson(fetchImpl, `https://api.github.com/repos/${USAGE_REPOSITORY}`);
      const count = (repository as { stargazers_count?: unknown } | null)?.stargazers_count;
      stars = typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : null;
    } catch {
      stars = null;
    }
    return {
      lastWeek: downloadCount(week),
      lastMonth: downloadCount(month),
      sinceLaunch: chunks.reduce((total: number, chunk) => total + rangeTotal(chunk), 0),
      stars,
      fetchedAt: now.toISOString(),
      countsThrough: countsThrough(week)
    };
  } catch {
    return null;
  }
}
