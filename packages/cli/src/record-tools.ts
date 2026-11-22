import { runDossierCommand, runOutcomeCommand } from "./outcome-command.js";

const PREVIEW = "Preview (may change before v0.10.0): ";

export const OUTCOMES_TOOL = {
  name: "fixmap_outcomes",
  title: "FixMap outcomes",
  description: `${PREVIEW}Read saved outcome records from .fixmap/outcomes/: list them, show one, or calibrate predicted versus edited paths across all of them. ` +
    "Read-only; calibration never changes ranking weights. Record new outcomes with the fixmap outcome CLI.",
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: {
    type: "object" as const,
    properties: {
      action: { type: "string", enum: ["list", "show", "calibrate"] },
      repo: { type: "string", description: "Local repository directory" },
      id: { type: "string", description: "Outcome record id (show only)" },
      format: { type: "string", enum: ["markdown", "json"] }
    },
    required: ["action"], additionalProperties: false
  }
};

export const DOSSIER_TOOL = {
  name: "fixmap_dossier",
  title: "FixMap change dossiers",
  description: `${PREVIEW}Read saved change dossiers from .fixmap/dossiers/: list them or show one with its request, plan and graph fingerprints, ADRs, diff, commands, and commit/PR identifiers. ` +
    "Read-only; create dossiers with the fixmap dossier CLI.",
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: {
    type: "object" as const,
    properties: {
      action: { type: "string", enum: ["list", "show"] },
      repo: { type: "string", description: "Local repository directory" },
      id: { type: "string", description: "Change dossier id (show only)" },
      format: { type: "string", enum: ["markdown", "json"] }
    },
    required: ["action"], additionalProperties: false
  }
};

export function runOutcomesTool(value: unknown, defaultRepo: string) {
  return runReadTool(value, defaultRepo, ["list", "show", "calibrate"], runOutcomeCommand);
}

export function runDossierTool(value: unknown, defaultRepo: string) {
  return runReadTool(value, defaultRepo, ["list", "show"], runDossierCommand);
}

async function runReadTool(
  value: unknown,
  defaultRepo: string,
  actions: string[],
  command: typeof runOutcomeCommand
) {
  const failure = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: `Invalid arguments: ${message}` }] });
  if (!value || typeof value !== "object" || Array.isArray(value)) return failure("expected an object.");
  const args = value as Record<string, unknown>;
  if (!actions.includes(String(args.action))) return failure(`action must be ${actions.join(", ")}.`);
  for (const [key, entry] of Object.entries(args)) {
    if (!["action", "repo", "id", "format"].includes(key)) return failure(`field ${key} is not allowed.`);
    if (typeof entry !== "string" || !entry.trim() || entry.length > 4_096) return failure(`${key} must be a bounded non-empty string.`);
  }
  if ((args.action === "show") !== (args.id !== undefined)) return failure(args.action === "show" ? "id is required for show." : "id only applies to show.");
  if (typeof args.id === "string" && args.id.startsWith("-")) return failure("id cannot begin with '-'.");
  if (args.repo && /^[a-z][a-z0-9+.-]*:\/\//i.test(String(args.repo))) return failure("repo must be a local directory.");
  const cliArgs = [String(args.action), ...(args.id ? [String(args.id)] : []), `--repo=${args.repo ?? defaultRepo}`, `--format=${args.format ?? "json"}`];
  const output: string[] = [];
  const errors: string[] = [];
  const code = await command(cliArgs, { stdout: (text) => { output.push(text); }, stderr: (text) => { errors.push(text); } });
  return { ...(code ? { isError: true } : {}), content: [{ type: "text" as const, text: (code ? errors : output).join("") }] };
}
