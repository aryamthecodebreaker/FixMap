import { describe, expect, it } from "vitest";
import { longestBacktickRun, markdownCode } from "../src/markdown.js";

describe("markdown fencing", () => {
  it("finds large numbers of backtick runs without spreading them onto the call stack", () => {
    const manyRuns = "`a".repeat(50_000);

    expect(longestBacktickRun(manyRuns)).toBe(1);
    expect(markdownCode(manyRuns).startsWith("``")).toBe(true);
    expect(longestBacktickRun("a``b```c")).toBe(3);
  });
});
