import { describe, expect, it } from "vitest";
import { parseActionIssueSource } from "../src/issue-source.js";

describe("Action GitHub issue URL normalization", () => {
  it.each([
    "https://www.github.com/Owner/Repository/issues/123?utm_source=test#note",
    "https://api.github.com/repos/Owner/Repository/issues/123"
  ])("normalizes %s to the public canonical issue", (input) => {
    expect(parseActionIssueSource(input)).toEqual(expect.objectContaining({
      owner: "Owner",
      repository: "Repository",
      number: 123,
      displayUrl: "https://github.com/Owner/Repository/issues/123"
    }));
  });

  it("still rejects insecure, credentialed, and encoded-separator variants", () => {
    expect(() => parseActionIssueSource("http://www.github.com/o/r/issues/1")).toThrow("must use https");
    expect(() => parseActionIssueSource("https://token@api.github.com/repos/o/r/issues/1")).toThrow("credentials");
    expect(() => parseActionIssueSource("https://user:secret@example.com/task/1")).toThrow("credentials");
    expect(() => parseActionIssueSource("https://www.github.com/o%2fr/issues/1")).toThrow("encoded separators");
  });
});
