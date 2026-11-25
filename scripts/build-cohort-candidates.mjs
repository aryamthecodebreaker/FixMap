#!/usr/bin/env node
// Build a fresh, never-used candidate list per language for a held-out cohort, from GitHub
// repository search metadata only (FixMap is not run). Usage:
//   node scripts/build-cohort-candidates.mjs --suite <name> --per-language <n> [--record]
import { execFile } from "node:child_process";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => { const index = process.argv.indexOf(name); return index === -1 ? undefined : process.argv[index + 1]; };
const suite = arg("--suite");
const perLanguage = Number(arg("--per-language") ?? "30");
if (!suite || !/^[a-z0-9-]+$/.test(suite)) throw new Error("--suite <name> is required.");

const LANGUAGES = { python: "Python", java: "Java", go: "Go", rust: "Rust", ruby: "Ruby", php: "PHP", dotnet: "C#" };
const NON_PRODUCT = /awesome|tutorial|interview|course|book|roadmap|list of|collection|cheat|guide|learn|resources|example|leetcode|algorithm|exercise|demo|sample|homework|free |projects|system design|prompts?|papers/i;

// Every repository any earlier cohort listed or used, whether or not it yielded a case.
const used = new Set();
for (const entry of await readdir(join(root, "benchmarks"), { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === suite) continue;
  for (const name of ["repositories.json", "dataset.json"]) {
    let text;
    try { text = await readFile(join(root, "benchmarks", entry.name, name), "utf8"); } catch { continue; }
    for (const match of text.matchAll(/"(?:slug|repo)"\s*:\s*"(?:https:\/\/github\.com\/)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?"/g)) used.add(match[1].toLowerCase());
  }
}
for (const match of (await readFile(join(root, "benchmarks", "cases.json"), "utf8")).matchAll(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?["/]/g)) used.add(match[1].toLowerCase());

const repositories = [];
const counts = {};
for (const [language, githubLanguage] of Object.entries(LANGUAGES)) {
  const { stdout } = await exec("gh", ["api", "-X", "GET", "search/repositories",
    "-f", `q=language:"${githubLanguage}"`, "-f", "sort=stars", "-f", "order=desc", "-f", "per_page=100"],
    { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  const survivors = JSON.parse(stdout).items.filter((item) =>
    !item.archived && !item.fork &&
    !used.has(item.full_name.toLowerCase()) &&
    !NON_PRODUCT.test(`${item.name} ${item.description ?? ""}`)
  ).slice(0, perLanguage);
  counts[language] = survivors.length;
  repositories.push(...survivors.map((item) => ({ slug: item.full_name, language })));
}

const config = {
  status: "held-out",
  targetPerLanguage: 15,
  modifiedFilesOnly: true,
  candidateRule: `For each language, GitHub repository search (language filter, sorted by stars, descending, first 100 results on ${new Date().toISOString().slice(0, 10)}), skipping archived repositories, forks, every repository listed or used by any earlier FixMap cohort, and repositories whose name or description matches ${NON_PRODUCT}. The first ${perLanguage} survivors per language are listed in star order.`,
  repositories
};
process.stdout.write(`${JSON.stringify(counts)}\n`);
if (process.argv.includes("--record")) {
  await mkdir(join(root, "benchmarks", suite), { recursive: true });
  await writeFile(join(root, "benchmarks", suite, "repositories.json"), `${JSON.stringify(config, null, 2)}\n`);
}
