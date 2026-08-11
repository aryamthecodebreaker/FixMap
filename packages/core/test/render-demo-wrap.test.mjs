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

  it("keeps emoji graphemes intact and rejects invalid widths", () => {
    const rows = wrapLine("🔒🔑🧪 secure", 4);
    expect(rows.some((row) => /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/.test(row))).toBe(false);
    expect(rows.flatMap((row) => [...row]).filter((character) => character === "🧪")).toHaveLength(1);
    expect(() => wrapLine("text", 0)).toThrow("positive whole number");
  });
});
