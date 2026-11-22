/**
 * A bounded reader for the block-YAML subset that OpenAPI and AsyncAPI documents use:
 * mappings, sequences, plain/quoted scalars, literal and folded block scalars, and simple
 * flow collections. Anchors, aliases, tags, merge keys, and multiple documents are refused
 * rather than guessed, so callers can report the document as unparseable instead of
 * producing a surface that silently differs from the author's intent.
 */

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

export class YamlSubsetError extends Error {}

type Line = { number: number; indent: number; text: string; raw: string };

const MAX_DEPTH = 64;

export function parseYamlSubset(content: string): YamlValue {
  const lines = toLines(content);
  if (lines.length === 0) return null;
  const state = { lines, index: 0 };
  const value = parseNode(state, lines[0]!.indent, 0);
  if (state.index < lines.length) fail(lines[state.index]!, "unexpected content after the document");
  return value;
}

function toLines(content: string): Line[] {
  const rawLines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const lines: Line[] = [];
  let started = false;
  for (let index = 0; index < rawLines.length; index += 1) {
    const raw = rawLines[index]!;
    if (/^%/.test(raw) && !started) continue;
    if (/^---(?:\s|$)/.test(raw)) {
      if (started || lines.length > 0) throw new YamlSubsetError(`line ${index + 1}: multiple YAML documents are not supported`);
      started = true;
      if (raw.slice(3).trim() && !raw.slice(3).trim().startsWith("#")) {
        throw new YamlSubsetError(`line ${index + 1}: content on the document marker is not supported`);
      }
      continue;
    }
    if (/^\.\.\.(?:\s|$)/.test(raw)) {
      if (rawLines.slice(index + 1).some((rest) => rest.trim() && !rest.trim().startsWith("#"))) {
        throw new YamlSubsetError(`line ${index + 1}: multiple YAML documents are not supported`);
      }
      break;
    }
    const leading = /^[ \t]*/.exec(raw)![0];
    const text = stripComment(raw.slice(leading.length)).trimEnd();
    if (!text) {
      lines.push({ number: index + 1, indent: -1, text: "", raw });
      continue;
    }
    if (leading.includes("\t")) throw new YamlSubsetError(`line ${index + 1}: tab indentation is not supported`);
    lines.push({ number: index + 1, indent: leading.length, text, raw });
  }
  return lines;
}

function stripComment(text: string): string {
  if (text.startsWith("#")) return "";
  let quote: string | undefined;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quote) {
      if (quote === "\"" && char === "\\") index += 1;
      else if (char === quote) quote = undefined;
      continue;
    }
    if ((char === "\"" || char === "'") && (index === 0 || /[\s:\[\]{},-]/.test(text[index - 1]!))) quote = char;
    else if (char === "#" && /\s/.test(text[index - 1] ?? "")) return text.slice(0, index);
  }
  return text;
}

type State = { lines: Line[]; index: number };

function current(state: State): Line | undefined {
  while (state.index < state.lines.length && state.lines[state.index]!.indent < 0) state.index += 1;
  return state.lines[state.index];
}

function parseNode(state: State, indent: number, depth: number): YamlValue {
  if (depth > MAX_DEPTH) throw new YamlSubsetError("YAML nesting is deeper than FixMap reads");
  const line = current(state);
  if (!line || line.indent < indent) return null;
  if (isSequenceItem(line.text)) return parseSequence(state, line.indent, depth);
  if (splitKey(line.text)) return parseMapping(state, line.indent, depth);
  state.index += 1;
  return parseInlineValue(line, line.text, state, line.indent, depth);
}

function isSequenceItem(text: string): boolean {
  return text === "-" || text.startsWith("- ");
}

function parseSequence(state: State, indent: number, depth: number): YamlValue[] {
  const values: YamlValue[] = [];
  for (let line = current(state); line && line.indent === indent && isSequenceItem(line.text); line = current(state)) {
    const rest = line.text.slice(1).trimStart();
    if (!rest) {
      state.index += 1;
      const next = current(state);
      values.push(next && next.indent > indent ? parseNode(state, next.indent, depth + 1) : null);
      continue;
    }
    // "- key: value" opens a mapping whose items align with the first key.
    const column = indent + (line.text.length - rest.length);
    state.lines[state.index] = { ...line, indent: column, text: rest };
    if (isSequenceItem(rest) || splitKey(rest)) values.push(parseNode(state, column, depth + 1));
    else {
      state.index += 1;
      values.push(parseInlineValue(line, rest, state, indent, depth));
    }
  }
  const after = current(state);
  if (after && after.indent > indent) fail(after, "unexpected indentation in a sequence");
  return values;
}

function parseMapping(state: State, indent: number, depth: number): { [key: string]: YamlValue } {
  const result: { [key: string]: YamlValue } = {};
  for (let line = current(state); line && line.indent === indent; line = current(state)) {
    const split = splitKey(line.text);
    if (!split) fail(line, "expected a mapping key");
    const key = parseKey(line, split.key);
    if (key === "<<") fail(line, "merge keys are not supported");
    if (Object.prototype.hasOwnProperty.call(result, key)) fail(line, `duplicate key ${JSON.stringify(key)}`);
    state.index += 1;
    if (!split.value) {
      const next = current(state);
      if (next && (next.indent > indent || (next.indent === indent && isSequenceItem(next.text)))) {
        result[key] = parseNode(state, next.indent, depth + 1);
      } else {
        result[key] = null;
      }
    } else {
      result[key] = parseInlineValue(line, split.value, state, indent, depth);
    }
  }
  const after = current(state);
  if (after && after.indent > indent) fail(after, "unexpected indentation in a mapping");
  return result;
}

/** Finds the key/value separator: a colon followed by whitespace or end of line, outside quotes and flow. */
function splitKey(text: string): { key: string; value: string } | undefined {
  if (isSequenceItem(text) || text.startsWith("{") || text.startsWith("[")) return undefined;
  let index = 0;
  if (text.startsWith("\"") || text.startsWith("'")) {
    const end = closingQuote(text, 0);
    if (end === -1) return undefined;
    index = end + 1;
    const rest = text.slice(index);
    const match = /^\s*:(?:\s|$)/.exec(rest);
    if (!match) return undefined;
    return { key: text.slice(0, index), value: rest.slice(match[0].length).trim() };
  }
  for (; index < text.length; index += 1) {
    if (text[index] === ":" && (index + 1 === text.length || /\s/.test(text[index + 1]!))) {
      return { key: text.slice(0, index).trimEnd(), value: text.slice(index + 1).trim() };
    }
  }
  return undefined;
}

function parseKey(line: Line, raw: string): string {
  if (raw.startsWith("? ")) fail(line, "complex mapping keys are not supported");
  if (raw.startsWith("\"") || raw.startsWith("'")) return parseQuoted(line, raw);
  if (/^[&*!]/.test(raw)) fail(line, "anchors, aliases, and tags are not supported");
  return raw;
}

function parseInlineValue(line: Line, value: string, state: State, parentIndent: number, depth: number): YamlValue {
  if (/^[&*!]/.test(value)) fail(line, "anchors, aliases, and tags are not supported");
  if (/^[|>]/.test(value)) return parseBlockScalar(line, value, state, parentIndent);
  if (value.startsWith("{") || value.startsWith("[")) {
    let text = value;
    // A flow collection may wrap onto more-indented lines.
    while (!flowBalanced(text)) {
      const next = current(state);
      if (!next || next.indent <= parentIndent) fail(line, "unterminated flow collection");
      text += ` ${next.text}`;
      state.index += 1;
    }
    const parser = { text, index: 0, line };
    const result = parseFlowValue(parser, depth);
    skipSpace(parser);
    if (parser.index !== text.length) fail(line, "unexpected content after a flow collection");
    return result;
  }
  if (value.startsWith("\"") || value.startsWith("'")) {
    let text = value;
    while (closingQuote(text, 0) === -1) {
      const next = current(state);
      if (!next) fail(line, "unterminated quoted scalar");
      text += ` ${next.raw.trim()}`;
      state.index += 1;
    }
    const end = closingQuote(text, 0);
    if (text.slice(end + 1).trim()) fail(line, "unexpected content after a quoted scalar");
    return parseQuoted(line, text);
  }
  // Plain scalars may continue onto more-indented lines; YAML folds them with spaces.
  let text = value;
  for (let next = current(state); next && next.indent > parentIndent; next = current(state)) {
    if (splitKey(next.text) || isSequenceItem(next.text)) fail(next, "a scalar value cannot also open a nested block");
    text += ` ${next.text}`;
    state.index += 1;
  }
  return resolvePlain(text);
}

function parseBlockScalar(line: Line, header: string, state: State, parentIndent: number): string {
  const match = /^([|>])([+-]?)(\d?)([+-]?)$/.exec(header.trim());
  if (!match) fail(line, "unsupported block scalar header");
  const folded = match[1] === ">";
  const chomping = match[2] || match[4];
  const explicit = match[3] ? Number(match[3]) : undefined;
  const collected: string[] = [];
  let contentIndent = explicit !== undefined ? parentIndent + explicit : undefined;
  while (state.index < state.lines.length) {
    const next = state.lines[state.index]!;
    // Block scalars keep "#" text, so read raw lines instead of comment-stripped ones.
    const blank = next.raw.trim() === "";
    const leading = /^ */.exec(next.raw)![0].length;
    if (!blank && leading <= parentIndent) break;
    if (!blank) {
      contentIndent ??= leading;
      if (leading < contentIndent) fail(next, "block scalar line is less indented than its first line");
    }
    collected.push(blank ? "" : next.raw.slice(contentIndent!));
    state.index += 1;
  }
  while (collected.length > 0 && collected.at(-1) === "" && chomping !== "+") collected.pop();
  let text = folded ? foldLines(collected) : collected.join("\n");
  if (chomping !== "-" && collected.length > 0) text += "\n";
  return text;
}

function foldLines(lines: string[]): string {
  let result = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (index === 0) { result = line; continue; }
    const previous = lines[index - 1]!;
    if (line === "") result += "\n";
    else if (previous === "" || /^\s/.test(line) || /^\s/.test(previous)) result += (previous === "" ? "" : "\n") + line;
    else result += ` ${line}`;
  }
  return result;
}

function resolvePlain(text: string): YamlValue {
  const value = text.trim();
  if (value === "" || value === "~" || /^(?:null|Null|NULL)$/.test(value)) return null;
  if (/^(?:true|True|TRUE)$/.test(value)) return true;
  if (/^(?:false|False|FALSE)$/.test(value)) return false;
  if (/^[-+]?(?:0|[1-9][0-9]*)$/.test(value)) {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : value;
  }
  if (/^[-+]?(?:[0-9]+\.[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$/.test(value) || /^[-+]?[0-9]+[eE][-+]?[0-9]+$/.test(value)) return Number(value);
  return value;
}

function closingQuote(text: string, start: number): number {
  const quote = text[start];
  for (let index = start + 1; index < text.length; index += 1) {
    if (quote === "\"" && text[index] === "\\") { index += 1; continue; }
    if (text[index] === quote) {
      if (quote === "'" && text[index + 1] === "'") { index += 1; continue; }
      return index;
    }
  }
  return -1;
}

function parseQuoted(line: Line, text: string): string {
  const end = closingQuote(text, 0);
  if (end === -1) fail(line, "unterminated quoted scalar");
  const body = text.slice(1, end);
  if (text[0] === "'") return body.replace(/''/g, "'");
  return body.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, escape: string) => {
    if (escape.length > 1) return String.fromCharCode(parseInt(escape.slice(1), 16));
    const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", "0": "\0", "\"": "\"", "\\": "\\", "/": "/", " ": " ", b: "\b", f: "\f" };
    if (!(escape in simple)) fail(line, `unsupported escape \\${escape}`);
    return simple[escape]!;
  });
}

type FlowParser = { text: string; index: number; line: Line };

function flowBalanced(text: string): boolean {
  let depth = 0;
  let quote: string | undefined;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quote) {
      if (quote === "\"" && char === "\\") index += 1;
      else if (char === quote) quote = undefined;
    } else if (char === "\"" || char === "'") quote = char;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") depth -= 1;
  }
  return depth <= 0 && !quote;
}

function skipSpace(parser: FlowParser): void {
  while (parser.index < parser.text.length && /\s/.test(parser.text[parser.index]!)) parser.index += 1;
}

function parseFlowValue(parser: FlowParser, depth: number): YamlValue {
  if (depth > MAX_DEPTH) throw new YamlSubsetError("YAML nesting is deeper than FixMap reads");
  skipSpace(parser);
  const char = parser.text[parser.index];
  if (char === "{") return parseFlowMapping(parser, depth + 1);
  if (char === "[") return parseFlowSequence(parser, depth + 1);
  if (char === "\"" || char === "'") {
    const end = closingQuote(parser.text, parser.index);
    if (end === -1) fail(parser.line, "unterminated quoted scalar");
    const value = parseQuoted(parser.line, parser.text.slice(parser.index, end + 1));
    parser.index = end + 1;
    return value;
  }
  if (char !== undefined && /[&*!]/.test(char)) fail(parser.line, "anchors, aliases, and tags are not supported");
  const start = parser.index;
  while (parser.index < parser.text.length && !/[,\]}]/.test(parser.text[parser.index]!) &&
    !(parser.text[parser.index] === ":" && /[\s,\]}]/.test(parser.text[parser.index + 1] ?? " "))) parser.index += 1;
  return resolvePlain(parser.text.slice(start, parser.index));
}

function parseFlowSequence(parser: FlowParser, depth: number): YamlValue[] {
  parser.index += 1;
  const values: YamlValue[] = [];
  skipSpace(parser);
  if (parser.text[parser.index] === "]") { parser.index += 1; return values; }
  for (;;) {
    values.push(parseFlowValue(parser, depth));
    skipSpace(parser);
    const char = parser.text[parser.index];
    parser.index += 1;
    if (char === "]") return values;
    if (char !== ",") fail(parser.line, "expected , or ] in a flow sequence");
    skipSpace(parser);
    if (parser.text[parser.index] === "]") { parser.index += 1; return values; }
  }
}

function parseFlowMapping(parser: FlowParser, depth: number): { [key: string]: YamlValue } {
  parser.index += 1;
  const result: { [key: string]: YamlValue } = {};
  skipSpace(parser);
  if (parser.text[parser.index] === "}") { parser.index += 1; return result; }
  for (;;) {
    const keyValue = parseFlowValue(parser, depth);
    if (keyValue !== null && typeof keyValue === "object") fail(parser.line, "complex mapping keys are not supported");
    const key = keyValue === null ? "" : String(keyValue);
    if (key === "<<") fail(parser.line, "merge keys are not supported");
    if (Object.prototype.hasOwnProperty.call(result, key)) fail(parser.line, `duplicate key ${JSON.stringify(key)}`);
    skipSpace(parser);
    if (parser.text[parser.index] === ":") {
      parser.index += 1;
      skipSpace(parser);
      const next = parser.text[parser.index];
      result[key] = next === "," || next === "}" ? null : parseFlowValue(parser, depth);
    } else {
      result[key] = null;
    }
    skipSpace(parser);
    const char = parser.text[parser.index];
    parser.index += 1;
    if (char === "}") return result;
    if (char !== ",") fail(parser.line, "expected , or } in a flow mapping");
    skipSpace(parser);
    if (parser.text[parser.index] === "}") { parser.index += 1; return result; }
  }
}

function fail(line: Line, message: string): never {
  throw new YamlSubsetError(`line ${line.number}: ${message}`);
}
