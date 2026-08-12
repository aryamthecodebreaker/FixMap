import type { RepoFile, RepoMap } from "@aryam/fixmap-core/browser";

// A small mail-sending API, written the way one actually would be — imports that resolve,
// symbols that are defined once, and the debris a real checkout carries: a committed
// build output, an examples folder, a type declaration, a lockfile, docs.
//
// The debris is the point. A sample repository containing only the answer would make
// FixMap look infallible and teach nothing. These files are here so the demo can show
// what gets deprioritized, what gets excluded outright, and why.

const files: RepoFile[] = [
  source("src/auth/reset-password.ts", `import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { resetEmailTemplate } from "../email/templates/reset.js";
import { sendMail } from "../email/transport.js";
import { tokenStore } from "./token-store.js";

export const TOKEN_TTL_MINUTES = 30;

export async function createResetToken(email: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const digest = createHash("sha256").update(token).digest("hex");

  await tokenStore.put(digest, {
    email,
    expiresAt: Date.now() + TOKEN_TTL_MINUTES * 60_000
  });

  await sendMail({
    to: email,
    subject: "Reset your password",
    html: resetEmailTemplate({ token, expiresInMinutes: TOKEN_TTL_MINUTES, origin: config.publicOrigin })
  });

  return token;
}

export async function consumeResetToken(token: string): Promise<string> {
  const digest = createHash("sha256").update(token).digest("hex");
  const record = await tokenStore.take(digest);

  if (!record || record.expiresAt < Date.now()) {
    throw new Error("reset token expired");
  }

  return record.email;
}`),

  source("src/auth/token-store.ts", `type TokenRecord = { email: string; expiresAt: number };

const records = new Map<string, TokenRecord>();

export const tokenStore = {
  async put(digest: string, record: TokenRecord): Promise<void> {
    records.set(digest, record);
  },
  async take(digest: string): Promise<TokenRecord | undefined> {
    const record = records.get(digest);
    records.delete(digest);
    return record;
  }
};`),

  source("src/auth/session.ts", `import { randomUUID } from "node:crypto";

export const SESSION_TTL_HOURS = 12;

export function createSession(userId: string) {
  return {
    id: randomUUID(),
    userId,
    expiresAt: Date.now() + SESSION_TTL_HOURS * 3_600_000
  };
}

export function isExpired(session: { expiresAt: number }): boolean {
  return session.expiresAt < Date.now();
}`),

  source("src/email/transport.ts", `import { createTransport } from "nodemailer";
import { config } from "../config.js";

const transport = createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  auth: { user: config.smtpUser, pass: config.smtpPassword }
});

export async function sendMail(message: { to: string; subject: string; html: string }): Promise<string> {
  const result = await transport.sendMail({ from: config.mailFrom, ...message });

  if (result.rejected.length > 0) {
    throw new Error(\`mail rejected for \${result.rejected.join(", ")}\`);
  }

  return result.messageId;
}`),

  source("src/email/templates/reset.ts", `export function resetEmailTemplate(input: {
  token: string;
  expiresInMinutes: number;
  origin: string;
}): string {
  const link = \`\${input.origin}/reset?token=\${input.token}\`;

  return \`<p>Choose a new password using the link below.</p>
<p>It expires in \${input.expiresInMinutes} minutes.</p>
<p><a href="\${link}">Choose a new password</a></p>\`;
}`),

  source("src/billing/invoice.ts", `import { config } from "../config.js";

export async function createInvoice(customerId: string, amountCents: number) {
  const response = await fetch(\`\${config.billingApiUrl}/invoices\`, {
    method: "POST",
    headers: { authorization: \`Bearer \${config.billingApiKey}\` },
    body: JSON.stringify({ customerId, amountCents, currency: "usd" })
  });

  if (!response.ok) {
    throw new Error(\`invoice creation failed with \${response.status}\`);
  }

  return response.json();
}`),

  source("src/http/routes.ts", `import { Router } from "express";
import { consumeResetToken, createResetToken } from "../auth/reset-password.js";
import { createSession } from "../auth/session.js";
import { createInvoice } from "../billing/invoice.js";

export const routes = Router();

routes.post("/auth/forgot", async (request, response) => {
  await createResetToken(request.body.email);
  response.status(202).json({ accepted: true });
});

routes.post("/auth/reset", async (request, response) => {
  const email = await consumeResetToken(request.body.token);
  response.json(createSession(email));
});

routes.post("/billing/invoices", async (request, response) => {
  response.json(await createInvoice(request.body.customerId, request.body.amountCents));
});`),

  configFile("src/config.ts", `export const config = {
  publicOrigin: process.env.PUBLIC_ORIGIN ?? "http://localhost:3000",
  smtpHost: process.env.SMTP_HOST ?? "localhost",
  smtpPort: Number(process.env.SMTP_PORT ?? 1025),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPassword: process.env.SMTP_PASSWORD ?? "",
  mailFrom: process.env.MAIL_FROM ?? "no-reply@example.com",
  billingApiUrl: process.env.BILLING_API_URL ?? "https://billing.example.com",
  billingApiKey: process.env.BILLING_API_KEY ?? ""
};`),

  // Committed build output. `src/auth/reset-password.ts` produces it, so editing it is
  // always wrong — the next build overwrites the change.
  source("dist/auth/reset-password.js", `import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { resetEmailTemplate } from "../email/templates/reset.js";
import { sendMail } from "../email/transport.js";
import { tokenStore } from "./token-store.js";
export const TOKEN_TTL_MINUTES = 30;
export async function createResetToken(email) {
  const token = randomBytes(32).toString("hex");
  const digest = createHash("sha256").update(token).digest("hex");
  await tokenStore.put(digest, { email, expiresAt: Date.now() + TOKEN_TTL_MINUTES * 60000 });
  await sendMail({ to: email, subject: "Reset your password", html: resetEmailTemplate({ token, expiresInMinutes: TOKEN_TTL_MINUTES, origin: config.publicOrigin }) });
  return token;
}`),

  // Demo code names the same subsystems without implementing them.
  source("examples/auth/basic-login.js", `// Minimal example: create a session and print its id.
import { createSession } from "../../src/auth/session.js";

const session = createSession("demo-user");
console.log("signed in", session.id, "expires", new Date(session.expiresAt));`),

  { ...source("test/auth/reset-password.test.ts", `import { describe, expect, it } from "vitest";
import { consumeResetToken, createResetToken, TOKEN_TTL_MINUTES } from "../../src/auth/reset-password.js";

describe("password reset", () => {
  it("round-trips a token", async () => {
    const token = await createResetToken("user@example.com");
    expect(await consumeResetToken(token)).toBe("user@example.com");
  });

  it("rejects a token twice", async () => {
    const token = await createResetToken("user@example.com");
    await consumeResetToken(token);
    await expect(consumeResetToken(token)).rejects.toThrow("reset token expired");
  });

  it("expires after the configured window", () => {
    expect(TOKEN_TTL_MINUTES).toBe(30);
  });
});`), isTest: true },

  source("types/nodemailer.d.ts", `declare module "nodemailer" {
  export type SentMessage = { messageId: string; rejected: string[] };
  export function createTransport(options: unknown): {
    sendMail(message: unknown): Promise<SentMessage>;
  };
}`),

  configFile("package.json", `{
  "name": "sample-api",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}`),

  configFile("package-lock.json", `{ "name": "sample-api", "lockfileVersion": 3, "packages": {} }`),

  doc("docs/configuration.md", `# Configuration

Every setting is read from the environment in \`src/config.ts\`.

| Variable | Default | Used by |
| --- | --- | --- |
| \`SMTP_HOST\` | \`localhost\` | password reset and receipt email |
| \`MAIL_FROM\` | \`no-reply@example.com\` | every outbound message |
| \`BILLING_API_URL\` | \`https://billing.example.com\` | invoice creation |`),

  doc("README.md", `# sample-api

A small Express service with password reset, sessions, and invoicing.

    npm install
    npm test`)
];

export const sampleRepo: RepoMap = {
  root: "sample-api",
  files,
  packageScripts: [
    { name: "test", command: "vitest run", packageDir: "" },
    { name: "typecheck", command: "tsc --noEmit", packageDir: "" }
  ],
  changedFiles: [],
  diffText: "",
  packageManager: "npm",
  diagnostics: [],
  history: {
    inspectedCommits: 8,
    skippedLargeCommits: 1,
    shallow: false,
    truncated: false,
    commits: [
      { hash: "1".repeat(40), committedAt: 8, files: ["src/auth/reset-password.ts", "src/auth/token-store.ts", "test/auth/reset-password.test.ts"] },
      { hash: "2".repeat(40), committedAt: 7, files: ["src/auth/reset-password.ts", "src/auth/token-store.ts", "src/http/routes.ts"] },
      { hash: "3".repeat(40), committedAt: 6, files: ["src/auth/reset-password.ts", "test/auth/reset-password.test.ts", "docs/configuration.md"] },
      { hash: "4".repeat(40), committedAt: 5, files: ["src/auth/reset-password.ts", "src/http/routes.ts", "test/auth/reset-password.test.ts"] },
      { hash: "5".repeat(40), committedAt: 4, files: ["src/email/transport.ts", "src/config.ts"] },
      { hash: "6".repeat(40), committedAt: 3, files: ["src/email/transport.ts", "src/config.ts", "test/auth/reset-password.test.ts"] },
      { hash: "7".repeat(40), committedAt: 2, files: ["src/billing/invoice.ts", "src/config.ts"] },
      { hash: "8".repeat(40), committedAt: 1, files: ["README.md"] }
    ]
  }
};

export const samplePaths: string[] = files.map((file) => file.path);

/** The same repository, with a diff applied — the second input `fixmap verify` needs. */
export function sampleRepoWithChanges(changedFiles: string[]): RepoMap {
  return { ...sampleRepo, changedFiles };
}

function source(path: string, textSample: string): RepoFile {
  return file(path, textSample, "code");
}

function configFile(path: string, textSample: string): RepoFile {
  // `src/config.ts` is code by extension; the scanner classifies by content role, and
  // treating settings files as config is what makes the demo match a real scan.
  return file(path, textSample, path.endsWith(".ts") ? "code" : "config");
}

function doc(path: string, textSample: string): RepoFile {
  return file(path, textSample, "documentation");
}

function file(path: string, textSample: string, kind: RepoFile["kind"]): RepoFile {
  const extensionIndex = path.lastIndexOf(".");
  return {
    path,
    extension: extensionIndex >= 0 ? path.slice(extensionIndex) : "",
    sizeBytes: textSample.length,
    isTest: false,
    isSource: true,
    kind,
    textSample,
    textSampleComplete: true
  };
}
