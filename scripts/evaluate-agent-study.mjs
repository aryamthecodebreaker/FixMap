import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const protocolPath = join(root, "benchmarks", "agent-study", "protocol.json");
const protocol = JSON.parse(await readFile(protocolPath, "utf8"));
const requiredArms = ["baseline", "fixmap-available", "fixmap-instructed", "fixmap-impact"];
const requiredMetrics = [
  "runStatus", "failureReason",
  "taskResolved", "correctFileInFirstThreeOpened", "toolCallsToFirstRelevantFile",
  "filesOpenedBeforeFirstEdit", "incorrectFilesEdited", "totalToolCalls", "inputTokens",
  "cachedInputTokens", "outputTokens", "reasoningTokens", "totalTokens", "modelCostUsd",
  "turns", "repositorySearchCalls", "filesRead", "sourceBytesRead", "wallClockMs",
  "testsSelectedCorrectly", "finalPatchAccepted", "fixmapPlanUsed", "verifyUsefulWarnings"
];
const identityFields = [
  "taskId", "taskTextSha256", "arm", "runOrder", "model", "modelVersion", "repository",
  "revision", "environmentId", "timeoutMs", "budgetId", "priceSheetId", "transcript",
  "transcriptSha256"
];
const booleanMetrics = [
  "taskResolved", "correctFileInFirstThreeOpened", "testsSelectedCorrectly",
  "finalPatchAccepted", "fixmapPlanUsed", "verifyUsefulWarnings"
];
const numericMetrics = [
  "toolCallsToFirstRelevantFile", "filesOpenedBeforeFirstEdit", "incorrectFilesEdited",
  "totalToolCalls", "inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens",
  "totalTokens", "modelCostUsd", "turns", "repositorySearchCalls", "filesRead",
  "sourceBytesRead", "wallClockMs"
];
const runStatuses = ["completed", "failed", "timed-out"];

if (protocol.protocolVersion !== 2 || protocol.status !== "protocol-only" ||
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
  for (const field of [...identityFields, ...requiredMetrics]) {
    if (!(field in row)) throw new Error(`Run ${index + 1} is missing ${field}.`);
  }
  if (!requiredArms.includes(row.arm)) throw new Error(`Run ${index + 1} has unknown arm ${JSON.stringify(row.arm)}.`);
  if (typeof row.transcript !== "string" || !row.transcript.trim()) throw new Error(`Run ${index + 1} has no transcript reference.`);
  if (!/^[a-f0-9]{64}$/i.test(row.taskTextSha256)) throw new Error(`Run ${index + 1} has an invalid taskTextSha256.`);
  if (!/^[a-f0-9]{64}$/i.test(row.transcriptSha256)) throw new Error(`Run ${index + 1} has an invalid transcriptSha256.`);
  if (!runStatuses.includes(row.runStatus)) throw new Error(`Run ${index + 1} has invalid runStatus ${JSON.stringify(row.runStatus)}.`);
  if (!Number.isInteger(row.runOrder) || row.runOrder < 1 || row.runOrder > requiredArms.length) throw new Error(`Run ${index + 1} has an invalid runOrder.`);
  if (!Number.isFinite(row.timeoutMs) || row.timeoutMs <= 0) throw new Error(`Run ${index + 1} has an invalid timeoutMs.`);
  if (row.runStatus === "completed" && row.failureReason !== null) throw new Error(`Run ${index + 1} completed but has a failureReason.`);
  if (row.runStatus !== "completed" && (typeof row.failureReason !== "string" || !row.failureReason.trim())) throw new Error(`Run ${index + 1} failed without a failureReason.`);
  for (const metric of booleanMetrics) {
    if (row[metric] !== true && row[metric] !== false && row[metric] !== null) throw new Error(`Run ${index + 1} has invalid ${metric}; expected boolean or null.`);
  }
  for (const metric of numericMetrics) {
    if (row[metric] !== null && (!Number.isFinite(row[metric]) || row[metric] < 0)) throw new Error(`Run ${index + 1} has invalid ${metric}; expected a non-negative number or null.`);
  }
  if (row.totalTokens !== null && [row.inputTokens, row.outputTokens].every(Number.isFinite) && row.totalTokens < row.inputTokens + row.outputTokens) {
    throw new Error(`Run ${index + 1} reports totalTokens below inputTokens + outputTokens.`);
  }
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
  if (new Set(taskRows.map((row) => row.runOrder)).size !== requiredArms.length) throw new Error(`Task ${task} does not contain a unique randomized runOrder for every arm.`);
  for (const field of ["taskTextSha256", "model", "modelVersion", "repository", "revision", "environmentId", "timeoutMs", "budgetId", "priceSheetId"]) {
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
    completedRuns: armRows.filter((row) => row.runStatus === "completed").length,
    failedRuns: armRows.filter((row) => row.runStatus !== "completed").length,
    taskResolutionRate: rate("taskResolved"),
    acceptedPatchRate: rate("finalPatchAccepted"),
    firstThreeFileRate: rate("correctFileInFirstThreeOpened"),
    medianToolCallsToRelevantFile: median("toolCallsToFirstRelevantFile"),
    medianTotalToolCalls: median("totalToolCalls"),
    medianRepositorySearchCalls: median("repositorySearchCalls"),
    medianFilesRead: median("filesRead"),
    medianSourceBytesRead: median("sourceBytesRead"),
    medianInputTokens: median("inputTokens"),
    medianCachedInputTokens: median("cachedInputTokens"),
    medianOutputTokens: median("outputTokens"),
    medianReasoningTokens: median("reasoningTokens"),
    medianTotalTokens: median("totalTokens"),
    medianModelCostUsd: median("modelCostUsd"),
    medianTurns: median("turns"),
    medianWallClockMs: median("wallClockMs")
  }];
}));
process.stdout.write(`${JSON.stringify({ protocolVersion: 2, tasks: tasks.length, aggregate }, null, 2)}\n`);
