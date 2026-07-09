import { describe, expect, it } from "vitest";
import { buildPullRequestIssueText, createGitHubClient, DEFAULT_COMMENT_AUTHOR, FIXMAP_REPORT_MARKER } from "../src/github.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("GitHub Action helpers", () => {
  it("uses the pull request title and body when no issue input is supplied", () => {
    expect(buildPullRequestIssueText({
      pull_request: { title: "Fix password reset", body: "Emails fail after a recent auth change." }
    })).toBe("Fix password reset\n\nEmails fail after a recent auth change.");
    expect(buildPullRequestIssueText(undefined)).toBe("Pull request review");
  });

  it("updates only the Action's own marked comment", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      if (url.includes("/comments?")) {
        return jsonResponse([
          { id: 10, body: FIXMAP_REPORT_MARKER, user: { login: "contributor" } },
          { id: 11, body: `${FIXMAP_REPORT_MARKER}\nold report`, user: { login: DEFAULT_COMMENT_AUTHOR } }
        ]);
      }
      return jsonResponse({ id: 11 });
    };

    const result = await createGitHubClient({ fetchImpl }).upsertPullRequestComment({
      token: "test-token",
      owner: "octo",
      repo: "demo",
      issueNumber: 42,
      markdown: "# FixMap Report"
    });

    expect(result).toBe("updated");
    expect(calls).toContainEqual({
      url: "https://api.github.com/repos/octo/demo/issues/comments/11",
      method: "PATCH"
    });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("creates a new comment when the marker only appears in another user's comment", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      if (url.includes("/comments?")) {
        return jsonResponse([{ id: 10, body: FIXMAP_REPORT_MARKER, user: { login: "contributor" } }]);
      }
      return jsonResponse({ id: 12 }, 201);
    };

    const result = await createGitHubClient({ fetchImpl }).upsertPullRequestComment({
      token: "test-token",
      owner: "octo",
      repo: "demo",
      issueNumber: 42,
      markdown: "# FixMap Report"
    });

    expect(result).toBe("created");
    expect(calls).toContainEqual({
      url: "https://api.github.com/repos/octo/demo/issues/42/comments",
      method: "POST"
    });
  });

  it("reports a useful error when GitHub rejects comment lookup", async () => {
    const fetchImpl: typeof fetch = async () => new Response("Bad credentials", { status: 401, statusText: "Unauthorized" });

    await expect(createGitHubClient({ fetchImpl }).upsertPullRequestComment({
      token: "test-token",
      owner: "octo",
      repo: "demo",
      issueNumber: 42,
      markdown: "# FixMap Report"
    })).rejects.toThrow("FixMap could not list pull request comments; GitHub returned 401 Unauthorized: Bad credentials");
  });
});
