import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [rootMetadata, packageMetadata] = await Promise.all([
  readFile(join(repoRoot, "action.yml"), "utf8"),
  readFile(join(repoRoot, "packages", "action", "action.yml"), "utf8")
]);
const expectedRootMetadata = packageMetadata.replace(
  "  main: dist/index.mjs",
  "  main: packages/action/dist/index.mjs"
);
if (expectedRootMetadata === packageMetadata) {
  process.stderr.write('Package Action metadata is missing the exact "  main: dist/index.mjs" entrypoint.\n');
  process.exit(1);
}

if (rootMetadata !== expectedRootMetadata) {
  process.stderr.write(
    "Root action.yml must match packages/action/action.yml except for its repository-root entrypoint.\n"
  );
  process.exit(1);
}

const entrypoint = join(repoRoot, "packages", "action", "dist", "index.mjs");
const metadata = await stat(entrypoint).catch(() => undefined);
if (!metadata?.isFile()) {
  process.stderr.write(`Action metadata entrypoint does not resolve to a file: ${entrypoint}\n`);
  process.exit(1);
}

process.stdout.write("Root and package Action metadata are synchronized.\n");
