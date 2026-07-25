export function wrapLine(line, columns, continuationIndent = "    ") {
  if (line.length <= columns) {
    return [line];
  }

  const rows = [];
  let rest = line;
  let indent = "";
  while (rest.length > columns - indent.length) {
    const available = Math.max(1, columns - indent.length);
    const whitespaceBreak = rest.lastIndexOf(" ", available);
    const breakAt = whitespaceBreak > 0 ? whitespaceBreak : available;
    rows.push(indent + rest.slice(0, breakAt).trimEnd());
    rest = rest.slice(whitespaceBreak > 0 ? breakAt + 1 : breakAt);
    indent = continuationIndent.slice(0, Math.max(0, columns - 1));
  }
  rows.push(indent + rest);
  return rows;
}
