import { describe, expect, it } from "vitest";
import {
  BUILT_IN_LANGUAGE_ADAPTERS,
  extractLanguageDefinitions,
  extractLanguageImports,
  isLanguageTestPath,
  languageAdapterForFile
} from "../src/language-adapters.js";

function sample(extension: string, textSample: string) {
  return { extension, textSample };
}

describe("built-in language adapters", () => {
  it("exposes deterministic JavaScript, Python, and Java adapters", () => {
    expect(BUILT_IN_LANGUAGE_ADAPTERS.map((adapter) => adapter.id))
      .toEqual(["javascript-typescript", "python", "java"]);
    expect(languageAdapterForFile({ extension: ".py" })?.id).toBe("python");
    expect(languageAdapterForFile({ extension: ".java" })?.id).toBe("java");
    expect(languageAdapterForFile({ extension: ".rs" })).toBeUndefined();
  });

  it("extracts Python imports, aliases, functions, and classes", () => {
    const file = sample(".py", [
      "import os, app.services.session as session",
      "from .tokens import decode_token, TokenError as Error",
      "from app.models import User",
      "",
      "async def reset_password(user):",
      "    return user",
      "",
      "class PasswordResetService:",
      "    pass"
    ].join("\n"));

    expect(extractLanguageImports(file)).toEqual([
      { adapter: "python", specifier: ".tokens", importedNames: ["decode_token", "TokenError"], wildcard: false },
      { adapter: "python", specifier: "app.models", importedNames: ["User"], wildcard: false },
      { adapter: "python", specifier: "os", importedNames: [], wildcard: false },
      { adapter: "python", specifier: "app.services.session", importedNames: [], wildcard: false }
    ]);
    expect(extractLanguageDefinitions(file).map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "reset_password", kind: "function" },
      { name: "PasswordResetService", kind: "class" }
    ]);
  });

  it("extracts Java imports, types, constructors, and methods", () => {
    const file = sample(".java", [
      "package com.acme.auth;",
      "import com.acme.accounts.User;",
      "import static com.acme.security.TokenVerifier.verify;",
      "public final class PasswordResetService implements Resettable {",
      "  public PasswordResetService() {}",
      "  public User resetPassword(User user) { return user; }",
      "}"
    ].join("\n"));

    expect(extractLanguageImports(file)).toEqual([
      { adapter: "java", specifier: "com.acme.accounts.User", importedNames: [], wildcard: false },
      { adapter: "java", specifier: "com.acme.security.TokenVerifier", importedNames: [], wildcard: false }
    ]);
    expect(extractLanguageDefinitions(file).map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "PasswordResetService", kind: "class" },
      { name: "PasswordResetService", kind: "method" },
      { name: "resetPassword", kind: "method" }
    ]);
  });

  it("recognizes language-specific test layouts without classifying ordinary source", () => {
    expect(isLanguageTestPath("tests/auth/test_reset.py", ".py")).toBe(true);
    expect(isLanguageTestPath("src/auth/reset.py", ".py")).toBe(false);
    expect(isLanguageTestPath("src/test/java/com/acme/PasswordResetTest.java", ".java")).toBe(true);
    expect(isLanguageTestPath("src/main/java/com/acme/PasswordReset.java", ".java")).toBe(false);
  });
});
