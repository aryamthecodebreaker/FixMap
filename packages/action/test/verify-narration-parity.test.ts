import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAction } from "../src/runner.js";
import { createVerifyScenarios, VERIFY_SCENARIOS, type VerifyScenario, type VerifyScenarioFixture } from "../../cli/test/fixtures/verify-scenarios.js";

const TIMEOUT = process.platform === "win32" ? 120_000 : 60_000;
const SNAPSHOTS = join(__dirname, "..", "..", "cli", "test", "__snapshots__");
let fixture: VerifyScenarioFixture;

beforeAll(async () => { fixture = await createVerifyScenarios(); }, TIMEOUT);
afterAll(async () => { await fixture?.cleanup(); });

/** The Action's verify comment must be the exact Markdown the CLI and MCP print for the same diff. */
describe("Action verify narration parity", () => {
  for (const scenario of Object.keys(VERIFY_SCENARIOS) as VerifyScenario[]) {
    it(`${scenario}: the Action comment equals the CLI snapshot`, async () => {
      await fixture.checkout(scenario);
      let stdout = "";
      let comment: string | undefined;
      await runAction({
        INPUT_MODE: "verify",
        INPUT_REPORT_PATH: fixture.planPath,
        INPUT_DIFF: "main...HEAD",
        INPUT_NO_CACHE: "true",
        GITHUB_TOKEN: "token",
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: "event.json",
        GITHUB_REPOSITORY: "acme/fixture"
      }, {
        cwd: () => fixture.root,
        readFile: (path) => path === "event.json"
          ? JSON.stringify({ pull_request: { number: 3, title: "Dedupe users" } })
          : readFileSync(path, "utf8"),
        appendFile: () => undefined,
        createClient: () => ({ upsertPullRequestComment: async (input: { markdown: string }) => { comment = input.markdown; } }) as never,
        stdout: (text) => { stdout += text; },
        uuid: () => "stable"
      }).catch((error: unknown) => {
        // Error findings fail the step after the report is printed; only the policy scenario has one.
        expect(scenario).toBe("policy-violation");
        expect(String(error)).toContain("FixMap verification found 1 error finding: architecture-boundary-violation.");
      });
      const expected = await readFile(join(SNAPSHOTS, `verify-${scenario}.md`), "utf8");
      expect(fixture.normalize(stdout)).toBe(expected);
      if (comment !== undefined) expect(fixture.normalize(comment)).toContain(expected.trimEnd());
    }, TIMEOUT);
  }
});
