import { describe, expect, it } from "vitest";
import { loadUsageStats } from "./usage-stats";

type Reply = { ok: boolean; body: unknown };

function fakeFetch(routes: (url: string) => Reply) {
  const urls: string[] = [];
  const fetchImpl = async (url: string) => {
    urls.push(url);
    const reply = routes(url);
    return { ok: reply.ok, json: async () => reply.body };
  };
  return { fetchImpl, urls };
}

const now = new Date("2027-09-01T12:00:00Z");

describe("loadUsageStats", () => {
  it("adds every download since launch across npm's range limit and reads stars", async () => {
    const { fetchImpl, urls } = fakeFetch((url) => {
      if (url.includes("/point/last-week/")) return { ok: true, body: { downloads: 100, start: "2026-11-15", end: "2026-11-21" } };
      if (url.includes("/point/last-month/")) return { ok: true, body: { downloads: 452 } };
      if (url.includes("/range/")) return { ok: true, body: { downloads: [{ downloads: 3 }, { downloads: 4 }] } };
      if (url.includes("api.github.com")) return { ok: true, body: { stargazers_count: 22 } };
      return { ok: false, body: null };
    });
    const stats = await loadUsageStats(fetchImpl, now);
    const ranges = urls.filter((url) => url.includes("/range/"));
    expect(ranges).toEqual([
      "https://api.npmjs.org/downloads/range/2026-07-10:2027-07-09/@aryam/fixmap",
      "https://api.npmjs.org/downloads/range/2027-07-10:2027-09-01/@aryam/fixmap"
    ]);
    expect(stats).toEqual({ lastWeek: 100, lastMonth: 452, sinceLaunch: 14, stars: 22, fetchedAt: now.toISOString(), countsThrough: "2026-11-21" });
  });

  it("returns null instead of a wrong number when npm fails or answers malformed data", async () => {
    const failing = fakeFetch(() => ({ ok: false, body: null }));
    expect(await loadUsageStats(failing.fetchImpl, now)).toBeNull();
    const malformed = fakeFetch((url) => ({ ok: true, body: url.includes("api.github.com") ? { stargazers_count: 1 } : { downloads: "lots" } }));
    expect(await loadUsageStats(malformed.fetchImpl, now)).toBeNull();
  });

  it("keeps download numbers when GitHub is unavailable", async () => {
    const { fetchImpl } = fakeFetch((url) => {
      if (url.includes("api.github.com")) return { ok: false, body: null };
      if (url.includes("/range/")) return { ok: true, body: { downloads: [{ downloads: 5 }] } };
      return { ok: true, body: { downloads: 9, end: "2026-11-21" } };
    });
    expect(await loadUsageStats(fetchImpl, now)).toMatchObject({ lastWeek: 9, lastMonth: 9, sinceLaunch: 10, stars: null });
  });
});
