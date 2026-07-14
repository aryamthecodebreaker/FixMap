// Renders docs/assets/fixmap-cli-demo.svg: an animated terminal recording of
// the CLI running against the checked-in tiny-auth example. The SVG is built
// from the live CLI output, so the recording is reproducible:
//
//   npm run build:cli
//   node scripts/render-demo.mjs
//
// Animation is plain CSS inside the SVG (works inside GitHub README <img>),
// plays once in ~11 seconds, and contains no fonts, scripts, or bitmaps.

import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMMAND = 'npx @aryam/fixmap plan --issue "password reset emails fail"';
const WRAP_COLUMNS = 92;
const LINE_HEIGHT = 21;
const FONT_SIZE = 13.5;
const PAD_X = 22;
const HEADER_HEIGHT = 44;
const COLORS = {
  background: "#0d1117",
  chrome: "#161b22",
  border: "#30363d",
  text: "#e6edf3",
  dim: "#8b949e",
  green: "#74f0ba",
  cyan: "#79c0ff",
  red: "#ff7b72",
  prompt: "#74f0ba"
};

const run = spawnSync(
  process.execPath,
  [join(repoRoot, "packages", "cli", "dist", "cli.js"), "plan", "--issue", "password reset emails fail", "--repo", join(repoRoot, "examples", "tiny-auth-app")],
  { encoding: "utf8" }
);
if (run.status !== 0) {
  console.error(run.stderr);
  process.exit(1);
}

const reportLines = run.stdout.replace(/\r\n/g, "\n").trimEnd().split("\n").filter((line) => line !== "# FixMap Report");
while (reportLines[0] === "") {
  reportLines.shift();
}

function escapeXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrap(line) {
  if (line.length <= WRAP_COLUMNS) {
    return [line];
  }
  const rows = [];
  let rest = line;
  let indent = "";
  while (rest.length > WRAP_COLUMNS - indent.length) {
    const slice = rest.slice(0, WRAP_COLUMNS - indent.length);
    const breakAt = slice.lastIndexOf(" ");
    rows.push(indent + rest.slice(0, breakAt).trimEnd());
    rest = rest.slice(breakAt + 1);
    indent = "    ";
  }
  rows.push(indent + rest);
  return rows;
}

// Colorize one report line into tspans: backticked segments cyan, headings
// green, the high severity marker red. Everything else default.
function renderSpans(line) {
  if (line.startsWith("## ")) {
    return `<tspan fill="${COLORS.green}" font-weight="bold">${escapeXml(line)}</tspan>`;
  }
  const withSeverity = line.split(/(\*\*high\*\*|\*\*medium\*\*|\*\*low\*\*)/);
  return withSeverity
    .map((part) => {
      if (/^\*\*(high|medium|low)\*\*$/.test(part)) {
        const color = part.includes("high") ? COLORS.red : COLORS.dim;
        return `<tspan fill="${color}" font-weight="bold">${escapeXml(part.replaceAll("**", ""))}</tspan>`;
      }
      return part
        .split(/(`[^`]*`)/)
        .map((piece) =>
          piece.startsWith("`") && piece.endsWith("`")
            ? `<tspan fill="${COLORS.cyan}">${escapeXml(piece.slice(1, -1))}</tspan>`
            : `<tspan>${escapeXml(piece)}</tspan>`
        )
        .join("");
    })
    .join("");
}

const rows = [];
rows.push({ spans: `<tspan fill="${COLORS.prompt}" font-weight="bold">$ </tspan><tspan>${escapeXml(COMMAND)}</tspan>`, delay: 0.4 });
rows.push({ spans: "", delay: 0.4 });

let delay = 2.2;
for (const line of reportLines) {
  if (line === "") {
    rows.push({ spans: "", delay });
    continue;
  }
  if (line.startsWith("## ")) {
    delay += 0.9;
  }
  for (const wrapped of wrap(line)) {
    rows.push({ spans: renderSpans(wrapped), delay, dim: line === "- None found" });
    delay += 0.25;
  }
}

const width = 860;
const height = HEADER_HEIGHT + rows.length * LINE_HEIGHT + 30;
const body = rows
  .map((row, index) => {
    if (!row.spans) {
      return "";
    }
    const y = HEADER_HEIGHT + 14 + (index + 1) * LINE_HEIGHT;
    const fill = row.dim ? COLORS.dim : COLORS.text;
    return `  <text class="l" style="animation-delay:${row.delay.toFixed(2)}s" x="${PAD_X}" y="${y}" fill="${fill}">${row.spans}</text>`;
  })
  .filter(Boolean)
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Animated terminal recording: one fixmap plan command produces ranked context files, a test route, an authentication risk note, and empty-state diagnostics.">
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: ${FONT_SIZE}px; white-space: pre; }
    .l { opacity: 0; animation: fadein 0.45s ease-out forwards; }
    .cursor { animation: blink 0.9s step-end 2, fadein 0.3s ease-out 1.8s reverse forwards; }
    @keyframes fadein { to { opacity: 1; } }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .l { animation: none; opacity: 1; } .cursor { animation: none; opacity: 0; } }
  </style>
  <rect width="${width}" height="${height}" rx="10" fill="${COLORS.background}" stroke="${COLORS.border}"/>
  <rect width="${width}" height="${HEADER_HEIGHT}" rx="10" fill="${COLORS.chrome}"/>
  <rect y="${HEADER_HEIGHT - 12}" width="${width}" height="12" fill="${COLORS.chrome}"/>
  <circle cx="24" cy="${HEADER_HEIGHT / 2}" r="6" fill="#ff5f57"/>
  <circle cx="46" cy="${HEADER_HEIGHT / 2}" r="6" fill="#febc2e"/>
  <circle cx="68" cy="${HEADER_HEIGHT / 2}" r="6" fill="#28c840"/>
  <text x="${width / 2}" y="${HEADER_HEIGHT / 2 + 4.5}" text-anchor="middle" fill="${COLORS.dim}">fixmap plan — examples/tiny-auth-app</text>
  <rect class="cursor" x="${PAD_X + 8.2 * (COMMAND.length + 2) + 4}" y="${HEADER_HEIGHT + 14 + LINE_HEIGHT - 12}" width="8" height="15" fill="${COLORS.green}"/>
${body}
</svg>
`;

const outputPath = join(repoRoot, "docs", "assets", "fixmap-cli-demo.svg");
await writeFile(outputPath, svg);
console.log(`Wrote ${outputPath} (${(svg.length / 1024).toFixed(1)} KB, ${rows.length} rows, final line at ~${delay.toFixed(1)}s)`);
