import { describe, expect, it } from "vitest";
import { truncateForDiagnostic } from "../src/text.js";

describe("diagnostic text", () => {
  it("never splits a UTF-16 surrogate pair at the truncation boundary", () => {
    const truncated = truncateForDiagnostic("ab😀cd", 3);

    expect(truncated).toBe("ab…");
    expect(truncated).not.toContain("�");
    expect([...truncated]).toEqual(["a", "b", "…"]);
  });
});
