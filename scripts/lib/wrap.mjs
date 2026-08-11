export function wrapLine(line, columns, continuationIndent = "    ") {
  if (!Number.isSafeInteger(columns) || columns < 1) {
    throw new RangeError("columns must be a positive whole number");
  }
  const graphemes = (value) => typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map((part) => part.segment)
    : [...value];
  if (graphemes(line).length <= columns) {
    return [line];
  }

  const rows = [];
  let rest = line;
  let indent = "";
  while (graphemes(rest).length > columns - graphemes(indent).length) {
    const available = Math.max(1, columns - graphemes(indent).length);
    const units = graphemes(rest);
    const candidate = units.slice(0, available).join("");
    const boundaryWhitespace = units[available] === " ";
    const whitespaceBreak = boundaryWhitespace ? available : candidate.lastIndexOf(" ");
    const breakAt = whitespaceBreak > 0 ? graphemes(candidate.slice(0, whitespaceBreak)).length : available;
    rows.push(indent + units.slice(0, breakAt).join("").trimEnd());
    rest = units.slice(whitespaceBreak > 0 ? breakAt + 1 : breakAt).join("");
    indent = continuationIndent.slice(0, Math.max(0, columns - 1));
  }
  rows.push(indent + rest);
  return rows;
}
