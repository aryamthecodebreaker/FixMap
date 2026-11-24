import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { answerFixMapQuestion } from "../src/ask.js";
import { checkArtifactCompatibility, supportedArtifactVersions } from "../src/compatibility.js";

/** Real artifacts written by published releases (scripts/generate-compat-fixtures.mjs). */
const root = join(__dirname, "fixtures", "compat");
const fixtures = readdirSync(root).sort().flatMap((version) =>
  readdirSync(join(root, version)).sort().map((file) => ({ version, file, value: JSON.parse(readFileSync(join(root, version, file), "utf8")) as Record<string, unknown> })));

describe("saved artifact compatibility", () => {
  it("covers several releases and artifact kinds", () => {
    expect(new Set(fixtures.map((fixture) => fixture.version))).toEqual(new Set(["0.9.0", "0.9.5", "0.9.7"]));
    expect(fixtures.length).toBeGreaterThanOrEqual(15);
  });

  for (const fixture of fixtures) {
    it(`reads the ${fixture.file.replace(".json", "")} written by FixMap ${fixture.version}`, () => {
      const result = checkArtifactCompatibility(fixture.value);
      expect(result.status, result.message).toBe("supported");
      expect(result.kind).toBe(fixture.file.replace(".json", ""));
    });
  }

  it("answers questions from a report written by an older release", async () => {
    for (const fixture of fixtures.filter((entry) => entry.file === "report.json")) {
      const answer = await answerFixMapQuestion(fixture.value, "Which tests should I run?");
      expect(answer.claimsVerified).toBe(false);
    }
  });

  it("tells the user to upgrade when an artifact comes from a newer FixMap", () => {
    for (const fixture of fixtures) {
      const field = checkArtifactCompatibility(fixture.value).versionField!;
      const newer = checkArtifactCompatibility({ ...fixture.value, [field]: 2 });
      expect(newer.status).toBe("newer-version");
      expect(newer.message).toMatch(/written by a newer FixMap.*upgrade FixMap/);
    }
  });

  it("rejects unknown objects, invalid version values, and damaged artifacts with a reason", () => {
    expect(checkArtifactCompatibility([1, 2])).toMatchObject({ status: "unknown-kind", kind: "unknown" });
    expect(checkArtifactCompatibility({ hello: "world" })).toMatchObject({ status: "unknown-kind" });
    expect(checkArtifactCompatibility({ reportVersion: "1" })).toMatchObject({ status: "invalid", message: expect.stringMatching(/positive whole number/) });
    expect(checkArtifactCompatibility({ reportVersion: 0 })).toMatchObject({ status: "invalid" });
    const store = fixtures.find((fixture) => fixture.file === "annotation-store.json")!.value;
    expect(checkArtifactCompatibility({ ...store, annotations: "nope" })).toMatchObject({ status: "invalid" });
  });

  it("still reads legacy reports that predate reportVersion", () => {
    const report = { ...fixtures.find((fixture) => fixture.file === "report.json")!.value };
    delete report.reportVersion;
    expect(checkArtifactCompatibility(report)).toMatchObject({ status: "supported", kind: "report", message: expect.stringContaining("legacy") });
  });

  it("lists one supported version per kind", () => {
    const kinds = supportedArtifactVersions();
    expect(new Set(kinds.map((entry) => entry.kind)).size).toBe(kinds.length);
    expect(kinds.every((entry) => entry.supportedVersions.length > 0)).toBe(true);
  });
});
