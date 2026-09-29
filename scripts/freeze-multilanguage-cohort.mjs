// Freeze a mechanically selected development cohort before measuring FixMap.
//
//   node scripts/freeze-multilanguage-cohort.mjs
//   node scripts/freeze-multilanguage-cohort.mjs --record
//
// Requires an authenticated GitHub CLI. Selection reads only issue/PR metadata and never
// invokes FixMap, so ranking output cannot influence which examples enter the cohort.

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const suiteDir = join(root, "benchmarks", "multilanguage-dev");
const repositoryConfig = JSON.parse(await readFile(join(suiteDir, "repositories.json"), "utf8"));
const outputPath = join(suiteDir, "dataset.json");
const SOURCE_EXTENSION = /\.(?:java|py|pyi)$/i;
const EXCLUDED_PATH = /(?:^|\/)(?:docs?|documentation|examples?|samples?|tests?|testdata|fixtures?|benchmarks?|generated|build|dist|target)(?:\/|$)|(?:^|\/)(?:test_[^/]+|[^/]+_test)\.py$|(?:Test|Tests|TestCase)\.java$/i;
const CONFIG_PATH = /(?:^|\/)(?:pom\.xml|pyproject\.toml|setup\.cfg|tox\.ini|requirements[^/]*\.txt|gradle\.properties)$/i;
const LOCK_PATH = /(?:^|\/)(?:poetry\.lock|pdm\.lock|uv\.lock)$/i;
const DOC_TITLE = /\b(?:docs?|documentation|readme|changelog|typo|spelling)\b/i;
const QUERY = `query($owner:String!,$name:String!){
  repository(owner:$owner,name:$name){
    licenseInfo{spdxId}
    pullRequests(first:50,states:MERGED,orderBy:{field:UPDATED_AT,direction:DESC}){
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
for (const slug of repositoryConfig.repositories) {
  const [owner, name] = slug.split("/");
  if (!owner || !name) throw new Error(`Invalid repository slug: ${slug}`);
  const response = await graphql({ owner, name });
  const repository = response.data?.repository;
  const selected = repository?.pullRequests?.nodes?.find((pullRequest) => eligible(pullRequest));
  if (!selected) {
    skipped.push({ slug, reason: "no eligible fixing pull request among the 50 most recently updated merged PRs" });
    continue;
  }
  const issue = selected.closingIssuesReferences.nodes.find((entry) => entry.body.trim().length >= 80);
  const expected = selected.files.nodes.map((entry) => entry.path).filter(isSourceFixPath).sort();
  cases.push({
    slug,
    repo: `https://github.com/${slug}.git`,
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
  status: "development-only",
  taskTextRule: "Closing issue title plus the first 600 characters of its body.",
  selectionRule:
    "Per configured repository: the first of the 50 most recently updated merged pull requests that closes an issue with at least 80 body characters, is not docs-titled, changes no more than 20 files total, and modifies 1-3 non-test Python or Java source files. The PR base commit and exact fixing source paths are frozen before FixMap is measured.",
  languages: ["python", "java"],
  cases,
  skipped
};
const rendered = `${JSON.stringify(dataset, null, 2)}\n`;
process.stdout.write(rendered);
if (process.argv.includes("--record")) await writeFile(outputPath, rendered, "utf8");

function eligible(pullRequest) {
  if (!pullRequest?.baseRefOid || pullRequest.changedFiles > 20 || DOC_TITLE.test(pullRequest.title ?? "")) return false;
  const issues = pullRequest.closingIssuesReferences?.nodes ?? [];
  if (!issues.some((issue) => issue.body.trim().length >= 80)) return false;
  const sources = (pullRequest.files?.nodes ?? []).map((entry) => entry.path).filter(isSourceFixPath);
  return sources.length >= 1 && sources.length <= 3;
}

function isSourceFixPath(path) {
  return SOURCE_EXTENSION.test(path) && !EXCLUDED_PATH.test(path) && !CONFIG_PATH.test(path) && !LOCK_PATH.test(path);
}

async function graphql(variables) {
  const { stdout } = await exec("gh", [
    "api", "graphql",
    "-f", `query=${QUERY}`,
    "-F", `owner=${variables.owner}`,
    "-F", `name=${variables.name}`
  ], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout);
}
