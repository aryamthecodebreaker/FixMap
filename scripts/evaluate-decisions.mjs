import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseDecisionRecord } from "../packages/core/dist/index.js";

// Development evaluation only: explicit GitHub reads, no repository code runs.
if (process.argv.slice(2).some((arg) => !["--nygard", "--validation"].includes(arg))) throw new Error("Only --nygard or --validation is supported.");
const validation = process.argv.includes("--validation");
const nygard = validation || process.argv.includes("--nygard");
const manifest = JSON.parse(await readFile(new URL(`../benchmarks/decisions/${validation ? "validation-cases" : nygard ? "nygard-cases" : "cases"}.json`, import.meta.url), "utf8"));
const results = [];
for (const path of manifest.paths) {
  const exported = JSON.parse(execFileSync("gh", ["api", `repos/${manifest.repository}/contents/${path}?ref=${manifest.sha}`], { encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024 }));
  const bytes = Buffer.from(exported.content, "base64");
  const fingerprint = `worktree:${createHash("sha256").update(bytes).digest("hex")}`;
  try {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = parseDecisionRecord({ path, content, fingerprint });
    // Independent checks for the manually reviewed headings in this frozen cohort.
    const authoredSection = (heading) => content.split(`\n## ${heading}\n`)[1]?.split("\n## ")[0].trim();
    const expectedStatus = nygard ? authoredSection("Status") : path.includes("0003-") ? "on hold" : undefined;
    const fieldsMatch = parsed.record?.context === authoredSection(nygard ? "Context" : "Context and Problem Statement") &&
      parsed.record?.decision === authoredSection(nygard ? "Decision" : "Decision Outcome") &&
      parsed.record?.title === /^# (.+)$/m.exec(content)?.[1] &&
      parsed.record?.consequences === (nygard ? authoredSection("Consequences") : undefined) && parsed.record?.date === (nygard ? /^Date: (\d{4}-\d{2}-\d{2})$/m.exec(content)?.[1] : undefined) &&
      parsed.record?.status === (nygard ? "accepted" : "unknown") && parsed.record?.authoredStatus === expectedStatus;
    results.push({ path, fingerprint, parsed: Boolean(parsed.record), status: parsed.record?.status ?? null,
      fieldsMatch, context: Boolean(parsed.record?.context), consequences: Boolean(parsed.record?.consequences), diagnostic: parsed.diagnostic?.code ?? null });
  } catch (error) {
    results.push({ path, fingerprint, parsed: false, error: error.message });
  }
}
process.stdout.write(`${JSON.stringify({ kind: manifest.kind, repository: manifest.repository, sha: manifest.sha, results }, null, 2)}\n`);
process.exitCode = results.some((result) => !result.parsed || !result.fieldsMatch) ? 1 : 0;
