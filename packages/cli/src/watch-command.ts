import { homedir } from "node:os";
import { resolve } from "node:path";
import { validateFixMapReport, type FixMapReport } from "@aryam/fixmap-core";
import { describeInputReadError, readDecodedTextFile } from "./decode-input.js";
import { renderWatchUpdate, validateWatchRepository, watchRepository, type WatchRepositoryInput, type WatchUpdate } from "./watch.js";

const USAGE = `Usage: fixmap watch --report <plan.json> [--repo <local-path>] [--interval <250-60000>] [--include-untracked] [--format markdown|json] [--fail-on error|warning] [--once]\n\nWatches a local Git working tree, verifies each changed state against the saved plan, and recalculates impact without executing repository code. Press Ctrl+C to stop.\n`;

export async function runWatchCommand(args: string[], dependencies: {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  watchRepository?: ((input: WatchRepositoryInput) => Promise<WatchUpdate | undefined>) | undefined;
  renderWatchUpdate?: ((update: WatchUpdate, format: "markdown" | "json") => string) | undefined;
}): Promise<number> {
  if (args[0] === "--help" || args[0] === "-h") { dependencies.stdout(USAGE); return 0; }
  let repoRoot = process.cwd();
  let reportPath: string | undefined;
  let intervalMs = 1_500;
  let includeUntracked = false;
  let once = false;
  let format: "markdown" | "json" = "markdown";
  let failOn: "error" | "warning" = "error";
  const seen = new Set<string>();
  const valueFlags = new Set(["--repo", "--report", "--interval", "--format", "--fail-on"]);
  const booleanFlags = new Set(["--include-untracked", "--once"]);

  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    const separator = raw.indexOf("=");
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    const inline = separator === -1 ? undefined : raw.slice(separator + 1);
    if ((!valueFlags.has(flag) && !booleanFlags.has(flag)) || seen.has(flag)) {
      dependencies.stderr(`${seen.has(flag) ? `Pass ${flag} only once.` : `Unknown watch option: ${raw}`}\n\n${USAGE}`);
      return 1;
    }
    seen.add(flag);
    if (booleanFlags.has(flag)) {
      if (inline !== undefined) { dependencies.stderr(`${flag} does not take a value.\n\n${USAGE}`); return 1; }
      if (flag === "--once") once = true;
      else includeUntracked = true;
      continue;
    }
    const following = args[index + 1];
    const value = inline ?? (following && !following.startsWith("-") ? following : undefined);
    if (inline === undefined && value !== undefined) index += 1;
    if (!value?.trim()) { dependencies.stderr(`${flag} requires a value.\n\n${USAGE}`); return 1; }
    if (flag === "--repo") repoRoot = expandHomePath(value.trim());
    else if (flag === "--report") reportPath = expandHomePath(value.trim());
    else if (flag === "--format") {
      const normalized = value.trim().toLowerCase();
      if (normalized !== "markdown" && normalized !== "json") { dependencies.stderr(`--format must be markdown or json.\n\n${USAGE}`); return 1; }
      format = normalized;
    } else if (flag === "--fail-on") {
      const normalized = value.trim().toLowerCase();
      if (normalized !== "error" && normalized !== "warning") { dependencies.stderr(`--fail-on must be error or warning.\n\n${USAGE}`); return 1; }
      failOn = normalized;
    } else {
      const parsed = Number(value);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < 250 || parsed > 60_000) {
        dependencies.stderr(`--interval must be a whole number from 250 to 60000 milliseconds.\n\n${USAGE}`);
        return 1;
      }
      intervalMs = parsed;
    }
  }

  if (!reportPath) { dependencies.stderr(`watch requires --report with a saved JSON plan.\n\n${USAGE}`); return 1; }
  if (/^https?:\/\//i.test(repoRoot)) { dependencies.stderr(`watch --repo needs a local Git checkout.\n\n${USAGE}`); return 1; }
  const report = readReport(reportPath, dependencies.stderr);
  if (!report) return 1;

  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    if (!dependencies.watchRepository) await validateWatchRepository(repoRoot);
    dependencies.stderr(once ? "Checking the current working tree once.\n" : `Watching ${resolve(repoRoot)} every ${intervalMs}ms. Press Ctrl+C to stop.\n`);
    const last = await (dependencies.watchRepository ?? watchRepository)({
      repoRoot,
      report,
      intervalMs,
      includeUntracked,
      once,
      signal: controller.signal,
      onUpdate: (update) => dependencies.stdout((dependencies.renderWatchUpdate ?? renderWatchUpdate)(update, format))
    });
    if (!once || !last) return 0;
    return last.verification.findings.some((finding) =>
      finding.severity === "error" || (failOn === "warning" && finding.severity === "warning")
    ) ? 1 : 0;
  } catch (error) {
    dependencies.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

function readReport(path: string, stderr: (text: string) => void): FixMapReport | undefined {
  try {
    const parsed = JSON.parse(readDecodedTextFile(path)) as unknown;
    const loaded = validateFixMapReport(parsed, `"${path}"`);
    if (!loaded.success) { stderr(`${loaded.message}\n`); return undefined; }
    return loaded.report;
  } catch (error) {
    stderr(`Could not read watch report "${path}": ${describeInputReadError(path, error)}\n`);
    return undefined;
  }
}

function expandHomePath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return resolve(homedir(), path.slice(2));
  return path;
}
