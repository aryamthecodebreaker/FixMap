import { runAnnotateCommand } from "./annotation-command.js";

export const ANNOTATION_TOOL = {
  name: "fixmap_annotate",
  title: "FixMap annotations",
  description: "Explicitly add, list, or remove reviewable local annotations. Add/remove writes .fixmap/annotations.json; use only when the user requests that change. Never executes repository code.",
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  inputSchema: {
    type: "object" as const,
    properties: {
      action: { type: "string", enum: ["add", "list", "remove"] },
      repo: { type: "string", description: "Local repository directory" },
      target: { type: "string", description: "Repository-relative file target" },
      note: { type: "string" }, owner: { type: "string" }, expires: { type: "string" },
      symbol: { type: "string" }, service: { type: "string" }, contract: { type: "string" },
      id: { type: "string", description: "Exact annotation ID to remove" },
      format: { type: "string", enum: ["markdown", "json"] }
    },
    required: ["action"], additionalProperties: false
  }
};

export async function runAnnotationTool(value: unknown, defaultRepo: string) {
  const failure = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: `Invalid arguments: ${message}` }] });
  if (!value || typeof value !== "object" || Array.isArray(value)) return failure("expected an object.");
  const args = value as Record<string, unknown>;
  if (!["add", "list", "remove"].includes(String(args.action))) return failure("action must be add, list, or remove.");
  const allowed = args.action === "add"
    ? ["action", "repo", "target", "note", "owner", "expires", "symbol", "service", "contract"]
    : args.action === "list" ? ["action", "repo", "format"] : ["action", "repo", "id"];
  for (const [key, entry] of Object.entries(args)) {
    if (!allowed.includes(key)) return failure(`field ${key} is not allowed for this action.`);
    if (typeof entry !== "string" || !entry.trim() || entry.length > 10_000) return failure(`${key} must be a bounded non-empty string.`);
  }
  if (args.action === "add" && args.note === undefined) return failure("note is required for add.");
  if (args.action === "remove" && args.id === undefined) return failure("id is required for remove.");
  if (args.repo && /^[a-z][a-z0-9+.-]*:\/\//i.test(String(args.repo))) return failure("repo must be a local directory.");
  const cliArgs = [`--repo=${args.repo ?? defaultRepo}`];
  if (args.action === "list") cliArgs.push("--list", `--format=${args.format ?? "json"}`);
  else if (args.action === "remove") cliArgs.push(`--remove=${args.id}`);
  else {
    if (args.target !== undefined) {
      if (String(args.target).startsWith("-")) return failure("target cannot begin with '-'.");
      cliArgs.push(String(args.target));
    }
    for (const key of ["note", "owner", "expires", "symbol", "service", "contract"]) {
      if (args[key] !== undefined) cliArgs.push(`--${key}=${args[key]}`);
    }
  }
  const output: string[] = [];
  const errors: string[] = [];
  const code = await runAnnotateCommand(cliArgs, { stdout: (text) => { output.push(text); }, stderr: (text) => { errors.push(text); } });
  return { ...(code ? { isError: true } : {}), content: [{ type: "text" as const, text: (code ? errors : output).join("") }] };
}
