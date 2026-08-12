import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const protocolPath = join(root, "benchmarks", "agent-study", "protocol.json");
const protocol = JSON.parse(await readFile(protocolPath, "utf8"));
const requiredArms = ["baseline", "fixmap-available", "fixmap-instructed", "fixmap-impact"];
const requiredMetrics = [
  "taskResolved", "correctFileInFirstThreeOpened", "toolCallsToFirstRelevantFile",
  "filesOpenedBeforeFirstEdit", "incorrectFilesEdited", "totalToolCalls", "inputTokens",
  "outputTokens", "testsSelectedCorrectly", "finalPatchAccepted", "fixmapPlanUsed", "verifyUsefulWarnings"
];

if (protocol.protocolVersion !== 1 || protocol.status !== "protocol-only" ||
  JSON.stringify(protocol.arms) !== JSON.stringify(requiredArms) ||
  requiredMetrics.some((metric) => !protocol.metrics.includes(metric)) ||
  Object.values(protocol.requirements).some((value) => value !== true)) {
  throw new Error("Agent-study protocol is incomplete or has drifted from its frozen four-arm contract.");
}

const inputIndex = process.argv.indexOf("--input");
if (inputIndex === -1) {
  process.stdout.write("Agent-study protocol valid. No run data supplied; no effectiveness result is claimed.\n");
  process.exit(0);
}
const inputPath = process.argv[inputIndex + 1];
if (!inputPath) throw new Error("--input requires a JSONL run file.");
const rows = (await readFile(resolve(inputPath), "utf8"))
  .split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`); }
  });
if (rows.length === 0) throw new Error("Agent-study input contains no runs.");

const keys = new Set();
for (const [index, row] of rows.entries()) {
  for (const field of ["taskId", "arm", "model", "modelVersion", "repository", "revision", "transcript", ...requiredMetrics]) {
    if (!(field in row)) throw new Error(`Run ${index + 1} is missing ${field}.`);
  }
  if (!requiredArms.includes(row.arm)) throw new Error(`Run ${index + 1} has unknown arm ${JSON.stringify(row.arm)}.`);
  if (typeof row.transcript !== "string" || !row.transcript.trim()) throw new Error(`Run ${index + 1} has no transcript reference.`);
  const key = `${row.taskId}\0${row.arm}`;
  if (keys.has(key)) throw new Error(`Duplicate task/arm run: ${row.taskId} / ${row.arm}.`);
  keys.add(key);
}

const tasks = [...new Set(rows.map((row) => row.taskId))];
for (const task of tasks) {
  const taskRows = rows.filter((row) => row.taskId === task);
  const arms = taskRows.map((row) => row.arm).sort();
  if (JSON.stringify(arms) !== JSON.stringify([...requiredArms].sort())) {
    throw new Error(`Task ${task} does not contain exactly one run from every arm.`);
  }
  for (const field of ["model", "modelVersion", "repository", "revision"]) {
    if (new Set(taskRows.map((row) => row[field])).size !== 1) throw new Error(`Task ${task} does not hold ${field} constant.`);
  }
}

const aggregate = Object.fromEntries(requiredArms.map((arm) => {
  const armRows = rows.filter((row) => row.arm === arm);
  const rate = (field) => armRows.filter((row) => row[field] === true).length / armRows.length;
  const median = (field) => {
    const values = armRows.map((row) => row[field]).filter(Number.isFinite).sort((a, b) => a - b);
    if (values.length === 0) return null;
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  };
  return [arm, {
    runs: armRows.length,
    taskResolutionRate: rate("taskResolved"),
    acceptedPatchRate: rate("finalPatchAccepted"),
    firstThreeFileRate: rate("correctFileInFirstThreeOpened"),
    medianToolCallsToRelevantFile: median("toolCallsToFirstRelevantFile"),
    medianTotalToolCalls: median("totalToolCalls")
  }];
}));
process.stdout.write(`${JSON.stringify({ protocolVersion: 1, tasks: tasks.length, aggregate }, null, 2)}\n`);
