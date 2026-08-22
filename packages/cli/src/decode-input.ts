import { readFileSync } from "node:fs";

/** Decode text produced by common editors and Windows PowerShell 5.1. */
export function decodeInputText(raw: string | Buffer): string {
  if (typeof raw === "string") return raw.replace(/^\uFEFF/, "");
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    return raw.subarray(2).toString("utf16le").replace(/^\uFEFF/, "");
  }
  if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) {
    const body = raw.subarray(2);
    const evenLength = body.length - (body.length % 2);
    return Buffer.from(body.subarray(0, evenLength)).swap16().toString("utf16le").replace(/^\uFEFF/, "");
  }
  if (raw.length >= 4 && raw.length % 2 === 0) {
    let evenNuls = 0;
    let oddNuls = 0;
    for (let index = 0; index < raw.length; index += 2) {
      if (raw[index] === 0) evenNuls += 1;
      if (raw[index + 1] === 0) oddNuls += 1;
    }
    const pairs = raw.length / 2;
    if (oddNuls / pairs >= 0.3 && evenNuls / pairs < 0.1) return raw.toString("utf16le").replace(/^\uFEFF/, "");
    if (evenNuls / pairs >= 0.3 && oddNuls / pairs < 0.1) return Buffer.from(raw).swap16().toString("utf16le").replace(/^\uFEFF/, "");
  }
  return raw.toString("utf8").replace(/^\uFEFF/, "");
}

export function readDecodedTextFile(path: string | number): string {
  return decodeInputText(readFileSync(path));
}

export function describeInputReadError(path: string, error: unknown): string {
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate?.code === "EISDIR") return `"${path}" is a directory; provide a file path.`;
  if (candidate?.code === "ENOENT") return `"${path}" does not exist.`;
  if (candidate?.code === "EACCES" || candidate?.code === "EPERM") return `"${path}" could not be read because access was denied.`;
  return typeof candidate?.message === "string" ? candidate.message.split(/\r?\n/, 1)[0]! : String(error);
}
