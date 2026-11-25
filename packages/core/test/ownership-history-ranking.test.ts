import { describe, expect, it } from "vitest";
import { routeReviewers } from "../src/ownership.js";
import type { RepoMap } from "../src/types.js";

type Commit = NonNullable<RepoMap["history"]>["commits"][number];
let clock = 0;
const commit = (author: string, ...files: string[]): Commit => {
  clock += 1;
  return { hash: clock.toString(16).padStart(40, "0"), committedAt: clock, author, files };
};

function repo(commits: Commit[]): RepoMap {
  return {
    root: "/repo", files: [], packageScripts: [], changedFiles: [], diffText: "", packageManager: "npm", diagnostics: [],
    history: { commits: [...commits].reverse(), inspectedCommits: commits.length, skippedLargeCommits: 0, shallow: false, truncated: false }
  };
}
const names = (result: ReturnType<typeof routeReviewers>) => result.suggestions.map((suggestion) => suggestion.reviewer);
const now = "2026-11-25T00:00:00Z";

describe("history-based reviewer ranking", () => {
  it("orders people with direct history by how many commits they made, not alphabetically", () => {
    const result = routeReviewers(repo([
      commit("Aaron", "src/pay.ts"),
      commit("Zoe", "src/pay.ts"), commit("Zoe", "src/pay.ts"), commit("Zoe", "src/pay.ts"),
      commit("Mia", "src/pay.ts"), commit("Mia", "src/pay.ts")
    ]), { changedPaths: ["src/pay.ts"], now });
    expect(names(result)).toEqual(["Zoe", "Mia", "Aaron"]);
  });

  it("widens to the same folder, then the most active committers, until three people are named", () => {
    const result = routeReviewers(repo([
      commit("Only Author", "src/billing/invoice.ts"),
      commit("Folder Regular", "src/billing/tax.ts"), commit("Folder Regular", "src/billing/tax.ts"),
      commit("Busy Elsewhere", "docs/a.md"), commit("Busy Elsewhere", "docs/b.md"), commit("Busy Elsewhere", "docs/c.md"),
      commit("Rare Elsewhere", "docs/d.md")
    ]), { changedPaths: ["src/billing/invoice.ts"], now });
    expect(names(result)).toEqual(["Only Author", "Folder Regular", "Busy Elsewhere"]);
    const widened = result.suggestions[1]!.evidence[0]!.detail;
    expect(widened).toContain("in src/billing");
    expect(widened).toContain("nobody with more direct history was found");
    expect(result.suggestions[2]!.evidence[0]!.detail).toContain("of the newest 7 non-merge commits in this repository");
  });

  it("does not widen when three people already touched the files, or when history is turned off", () => {
    const commits = [
      commit("A", "src/x.ts"), commit("B", "src/x.ts"), commit("C", "src/x.ts"),
      commit("Busy", "src/other.ts"), commit("Busy", "src/other.ts"), commit("Busy", "src/other.ts"), commit("Busy", "src/other.ts")
    ];
    expect(names(routeReviewers(repo(commits), { changedPaths: ["src/x.ts"], now })).sort()).toEqual(["A", "B", "C"]);
    expect(names(routeReviewers(repo(commits), { changedPaths: ["src/x.ts"], now, includeHistoryAuthors: false }))).toEqual([]);
  });
});
