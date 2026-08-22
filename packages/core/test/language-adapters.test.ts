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
  it("exposes deterministic adapters for eight language families", () => {
    expect(BUILT_IN_LANGUAGE_ADAPTERS.map((adapter) => adapter.id))
      .toEqual(["javascript-typescript", "python", "java", "go", "rust", "ruby", "php", "dotnet"]);
    expect(languageAdapterForFile({ extension: ".py" })?.id).toBe("python");
    expect(languageAdapterForFile({ extension: ".java" })?.id).toBe("java");
    expect(languageAdapterForFile({ extension: ".rs" })?.id).toBe("rust");
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

  it("extracts Go package imports, functions, methods, types, and variables", () => {
    const file = sample(".go", [
      "package auth",
      "import (",
      "  \"context\"",
      "  tokens \"example.com/acme/auth/tokens\"",
      ")",
      "type PasswordResetService struct {}",
      "type TokenReader interface { Read() string }",
      "const DefaultTimeout = 30",
      "func ResetPassword(ctx context.Context) error { return nil }",
      "func (s *PasswordResetService) SendMail() {}"
    ].join("\n"));
    expect(extractLanguageImports(file)).toEqual([
      { adapter: "go", specifier: "context", importedNames: [], wildcard: false },
      { adapter: "go", specifier: "example.com/acme/auth/tokens", importedNames: [], wildcard: false }
    ]);
    expect(extractLanguageDefinitions(file).map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "PasswordResetService", kind: "class" },
      { name: "TokenReader", kind: "class" },
      { name: "DefaultTimeout", kind: "variable" },
      { name: "ResetPassword", kind: "function" },
      { name: "SendMail", kind: "function" }
    ]);
  });

  it("extracts Rust uses, modules, functions, data types, traits, aliases, and constants", () => {
    const file = sample(".rs", [
      "use crate::auth::{Token, verify};",
      "pub mod parser;",
      "pub struct PasswordResetService;",
      "pub trait Resettable {}",
      "pub type UserId = String;",
      "pub const DEFAULT_TIMEOUT: u64 = 30;",
      "pub async fn reset_password() {}"
    ].join("\n"));
    expect(extractLanguageImports(file)).toEqual([
      { adapter: "rust", specifier: "crate::auth", importedNames: [], wildcard: false },
      { adapter: "rust", specifier: "self::parser", importedNames: [], wildcard: false }
    ]);
    expect(extractLanguageDefinitions(file).map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "PasswordResetService", kind: "class" },
      { name: "Resettable", kind: "interface" },
      { name: "UserId", kind: "type" },
      { name: "DEFAULT_TIMEOUT", kind: "variable" },
      { name: "reset_password", kind: "function" }
    ]);
  });

  it("extracts Ruby requires, classes, modules, and methods", () => {
    const file = sample(".rb", [
      "require_relative './tokens'",
      "require 'json'",
      "module Auth",
      "  class PasswordResetService",
      "    def reset_password(user)",
      "    end",
      "  end",
      "end"
    ].join("\n"));
    expect(extractLanguageImports(file)).toEqual([
      { adapter: "ruby", specifier: "relative:./tokens", importedNames: [], wildcard: false },
      { adapter: "ruby", specifier: "absolute:json", importedNames: [], wildcard: false }
    ]);
    expect(extractLanguageDefinitions(file).map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "Auth", kind: "type" },
      { name: "PasswordResetService", kind: "class" },
      { name: "reset_password", kind: "method" }
    ]);
  });

  it("extracts PHP namespaces/files, types, interfaces, and functions", () => {
    const file = sample(".php", [
      "<?php",
      "use Acme\\Accounts\\User;",
      "require_once './tokens.php';",
      "final class PasswordResetService {}",
      "interface Resettable {}",
      "function resetPassword(User $user) {}"
    ].join("\n"));
    expect(extractLanguageImports(file)).toEqual([
      { adapter: "php", specifier: "Acme\\Accounts\\User", importedNames: [], wildcard: false },
      { adapter: "php", specifier: "file:./tokens.php", importedNames: [], wildcard: false }
    ]);
    expect(extractLanguageDefinitions(file).map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "PasswordResetService", kind: "class" },
      { name: "Resettable", kind: "interface" },
      { name: "resetPassword", kind: "function" }
    ]);
  });

  it("extracts .NET usings, types, delegates, and methods", () => {
    const file = sample(".cs", [
      "using Acme.Accounts;",
      "using Token = Acme.Security.Token;",
      "public sealed class PasswordResetService {",
      "  public async Task ResetPassword(User user) { }",
      "}",
      "public interface IResettable {}",
      "public delegate void ResetCompleted(User user);"
    ].join("\n"));
    expect(extractLanguageImports(file)).toEqual([
      { adapter: "dotnet", specifier: "Acme.Accounts", importedNames: [], wildcard: false },
      { adapter: "dotnet", specifier: "Acme.Security.Token", importedNames: [], wildcard: false }
    ]);
    expect(extractLanguageDefinitions(file).map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "PasswordResetService", kind: "class" },
      { name: "ResetPassword", kind: "method" },
      { name: "IResettable", kind: "interface" },
      { name: "ResetCompleted", kind: "type" }
    ]);
  });

  it("recognizes language-specific test layouts without classifying ordinary source", () => {
    expect(isLanguageTestPath("tests/auth/test_reset.py", ".py")).toBe(true);
    expect(isLanguageTestPath("src/auth/reset.py", ".py")).toBe(false);
    expect(isLanguageTestPath("src/test/java/com/acme/PasswordResetTest.java", ".java")).toBe(true);
    expect(isLanguageTestPath("src/main/java/com/acme/PasswordReset.java", ".java")).toBe(false);
    expect(isLanguageTestPath("auth/password_reset_test.go", ".go")).toBe(true);
    expect(isLanguageTestPath("tests/password_reset.rs", ".rs")).toBe(true);
    expect(isLanguageTestPath("spec/auth/password_reset_spec.rb", ".rb")).toBe(true);
    expect(isLanguageTestPath("tests/PasswordResetTest.php", ".php")).toBe(true);
    expect(isLanguageTestPath("tests/PasswordResetTests.cs", ".cs")).toBe(true);
  });
});
