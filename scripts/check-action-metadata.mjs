import { readFile } from "node:fs/promises";
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

if (rootMetadata !== expectedRootMetadata) {
  process.stderr.write(
    "Root action.yml must match packages/action/action.yml except for its repository-root entrypoint.\n"
  );
  process.exit(1);
}

process.stdout.write("Root and package Action metadata are synchronized.\n");
