import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const server = readJson("server.json");
const cli = readJson("packages/cli/package.json");
const errors = [];

if (server.name !== cli.mcpName) {
  errors.push(`server name must match CLI mcpName (${cli.mcpName})`);
}

if (
  typeof server.description !== "string" ||
  server.description.trim().length === 0 ||
  server.description.length > 100
) {
  errors.push(
    `server description must contain 1-100 characters; received ${String(server.description).length}`
  );
}

if (server.version !== cli.version) {
  errors.push(`server version ${server.version} must match CLI version ${cli.version}`);
}

const npmPackage = server.packages?.find(
  (entry) =>
    entry.registryType === "npm" &&
    entry.identifier === cli.name
);

if (!npmPackage) {
  errors.push(`server packages must include npm package ${cli.name}`);
} else if (npmPackage.version !== cli.version) {
  errors.push(
    `server npm package version ${npmPackage.version} must match CLI version ${cli.version}`
  );
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`Server manifest check failed: ${error}`);
  }
  process.exit(1);
}

console.log(
  `Server manifest is valid: ${server.name}@${server.version} (${server.description.length}/100 description characters).`
);
