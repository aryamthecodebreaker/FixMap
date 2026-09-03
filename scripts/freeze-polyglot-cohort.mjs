// Freeze a mechanically selected Go/Rust/Ruby/PHP/.NET development cohort before
// invoking FixMap. Selection reads GitHub issue and pull-request metadata only.

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const suiteIndex = process.argv.indexOf("--suite");
const suite = suiteIndex === -1 ? "polyglot-dev" : process.argv[suiteIndex + 1];
if (!suite || !["polyglot-dev", "polyglot-validation"].includes(suite)) {
  throw new Error(`Unknown polyglot cohort suite: ${suite ?? "(missing)"}.`);
}
const suiteDir = join(root, "benchmarks", suite);
const config = JSON.parse(await readFile(join(suiteDir, "repositories.json"), "utf8"));
const outputPath = join(suiteDir, "dataset.json");
const mergedAfter = parseOptionalTimestamp(config.mergedAfter, "mergedAfter");
const excludedPullRequests = await loadExcludedPullRequests(config.excludePullRequestsFrom);
const languageExtensions = {
  go: /\.go$/i,
  rust: /\.rs$/i,
  ruby: /\.rb$/i,
  php: /\.php$/i,
  dotnet: /\.cs$/i
};
const excludedPath = /(?:^|\/)(?:docs?|documentation|examples?|samples?|tests?|specs?|testdata|fixtures?|benchmarks?|generated|vendor|build|dist|target|obj|bin)(?:\/|$)|(?:^|\/)[^/]+_test\.go$|(?:^|\/)[^/]+_spec\.rb$|(?:^|\/)[^/]+_test\.rb$|(?:Test|Tests|TestCase)\.(?:php|cs)$/i;
const generatedPath = /(?:\.g\.cs|\.designer\.cs|\.generated\.cs|_generated\.go)$/i;
const docTitle = /\b(?:docs?|documentation|readme|changelog|typo|spelling)\b/i;
const query = `query($owner:String!,$name:String!){
  repository(owner:$owner,name:$name){
    licenseInfo{spdxId}
    pullRequests(first:100,states:MERGED,orderBy:{field:UPDATED_AT,direction:DESC}){
      nodes{
        number title baseRefOid mergedAt changedFiles
        closingIssuesReferences(first:5){nodes{number title body}}
        files(first:20){nodes{path}}
      }
    }
  }
}`;

const cases = [];
const skipped = [];
for (const configured of config.repositories) {
  const [owner, name] = String(configured.slug).split("/");
  const extension = languageExtensions[configured.language];
  if (!owner || !name || !extension) throw new Error(`Invalid polyglot repository config: ${JSON.stringify(configured)}`);
  const response = await graphql({ owner, name });
  const repository = response.data?.repository;
  const selected = repository?.pullRequests?.nodes?.find((pullRequest) =>
    eligible(pullRequest, extension) &&
    (!mergedAfter || Date.parse(pullRequest.mergedAt) > mergedAfter) &&
    !excludedPullRequests.has(`${configured.slug}#${pullRequest.number}`)
  );
  if (!selected) {
    skipped.push({
      slug: configured.slug,
      language: configured.language,
      reason: mergedAfter
        ? `no eligible fixing pull request merged after ${config.mergedAfter} among the 100 most recently updated merged PRs`
        : "no eligible fixing pull request among the 100 most recently updated merged PRs"
    });
    continue;
  }
  const issue = selected.closingIssuesReferences.nodes.find((entry) => entry.body.trim().length >= 80);
  const expected = selected.files.nodes.map((entry) => entry.path).filter((path) => sourceFixPath(path, extension)).sort();
  cases.push({
    slug: configured.slug,
    language: configured.language,
    repo: `https://github.com/${configured.slug}.git`,
    license: repository.licenseInfo?.spdxId ?? "NOASSERTION",
    sha: selected.baseRefOid,
    issue: issue.number,
    pullRequest: selected.number,
    task: `${issue.title}\n\n${issue.body.slice(0, 600)}`,
    expected
  });
}

const dataset = {
  generatedAt: new Date().toISOString().slice(0, 10),
  status: config.status ?? "development-only",
  taskTextRule: "Closing issue title plus the first 600 characters of its body.",
  selectionRule:
    "Per configured repository and language: the first of the 100 most recently updated merged pull requests that closes an issue with at least 80 body characters, is not docs-titled, changes no more than 20 files total, and modifies 1-3 non-test implementation files in that language." +
    (config.mergedAfter ? ` It must have merged after ${config.mergedAfter}.` : "") +
    (config.excludePullRequestsFrom ? ` Pull requests already present in ${config.excludePullRequestsFrom} are excluded.` : "") +
    " The PR base commit and exact fixing source paths are frozen before FixMap is measured.",
  languages: ["go", "rust", "ruby", "php", "dotnet"],
  cases,
  skipped
};
const rendered = `${JSON.stringify(dataset, null, 2)}\n`;
process.stdout.write(rendered);
if (process.argv.includes("--record")) await writeFile(outputPath, rendered, "utf8");

function eligible(pullRequest, extension) {
  if (!pullRequest?.baseRefOid || pullRequest.changedFiles > 20 || docTitle.test(pullRequest.title ?? "")) return false;
  if (!(pullRequest.closingIssuesReferences?.nodes ?? []).some((issue) => issue.body.trim().length >= 80)) return false;
  const sources = (pullRequest.files?.nodes ?? []).map((entry) => entry.path).filter((path) => sourceFixPath(path, extension));
  return sources.length >= 1 && sources.length <= 3;
}
function sourceFixPath(path, extension) {
  return extension.test(path) && !excludedPath.test(path) && !generatedPath.test(path);
}
async function graphql(variables) {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { stdout } = await exec("gh", [
        "api", "graphql", "-f", `query=${query}`,
        "-F", `owner=${variables.owner}`, "-F", `name=${variables.name}`
      ], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
      return JSON.parse(stdout);
    } catch (error) {
      const detail = [error?.stderr, error?.stdout, error?.message].filter(Boolean).join("\n");
      const status = detail.match(/\bHTTP\s+(429|5\d\d)\b/)?.[1];
      if (!status || attempt === attempts) {
        throw new Error(
          `GitHub metadata query failed for ${variables.owner}/${variables.name}` +
          `${status ? ` after ${attempts} attempts (HTTP ${status})` : ""}.`,
          { cause: error }
        );
      }
      await delay(1_000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`GitHub metadata query failed for ${variables.owner}/${variables.name}.`);
}

function parseOptionalTimestamp(value, field) {
  if (value === undefined) return undefined;
  const timestamp = Date.parse(value);
  if (typeof value !== "string" || !Number.isFinite(timestamp)) {
    throw new Error(`Invalid ${field} timestamp in ${suite}/repositories.json.`);
  }
  return timestamp;
}

async function loadExcludedPullRequests(relativePath) {
  if (relativePath === undefined) return new Set();
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw new Error(`Invalid excludePullRequestsFrom in ${suite}/repositories.json.`);
  }
  const prior = JSON.parse(await readFile(resolve(suiteDir, relativePath), "utf8"));
  if (!Array.isArray(prior.cases)) {
    throw new Error(`Excluded cohort ${relativePath} does not contain a cases array.`);
  }
  return new Set(prior.cases.flatMap((entry) =>
    typeof entry.slug === "string" && Number.isSafeInteger(entry.pullRequest)
      ? [`${entry.slug}#${entry.pullRequest}`]
      : []
  ));
}
