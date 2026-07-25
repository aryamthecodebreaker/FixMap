import { describe, expect, it } from "vitest";
import { wrapLine } from "../../../scripts/lib/wrap.mjs";

describe("render-demo line wrapping", () => {
  it("hard-wraps long unbroken paths without looping or losing characters", () => {
    const path = "src/" + "deeply-nested-directory/".repeat(20) + "password-reset-handler.ts";
    const rows = wrapLine(path, 24);

    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((row) => row.length <= 24)).toBe(true);
    expect(rows.map((row) => row.trimStart()).join("")).toBe(path);
  });

  it("prefers whitespace boundaries for ordinary prose", () => {
    expect(wrapLine("alpha beta gamma", 10)).toEqual(["alpha beta", "    gamma"]);
  });
});
