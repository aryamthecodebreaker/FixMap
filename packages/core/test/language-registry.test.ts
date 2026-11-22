import { describe, expect, it, vi } from "vitest";
import { createLanguageRegistry, type CustomLanguageAdapter } from "../src/language-registry.js";

function adapter(id = "custom:example", extensions = [".example"]): CustomLanguageAdapter {
  return {
    contractVersion: 1, id: id as CustomLanguageAdapter["id"], version: "1.0.0", extensions,
    extractImports: vi.fn(() => []), extractDefinitions: vi.fn(() => []),
    isTestPath: vi.fn(() => false), resolveImport: vi.fn(() => [])
  };
}

describe("language registry foundation", () => {
  it("bounds registry and extension counts and rejects non-array input", () => {
    expect(() => createLanguageRegistry(null as unknown as CustomLanguageAdapter[])).toThrow();
    expect(() => createLanguageRegistry(Array.from({ length: 33 }, (_, index) =>
      adapter(`custom:lang-${index}`, [`.x${index}`])))).toThrow();
    expect(() => createLanguageRegistry([adapter('custom:many',
      Array.from({ length: 33 }, (_, index) => `.x${index}`))])).toThrow();
    expect(() => createLanguageRegistry(Array.from({ length: 32 }, (_, index) =>
      adapter(`custom:lang-${index}`, [`.x${index}`])))).not.toThrow();
  });

  it("canonicalizes registration order and changes identity when versions change", () => {
    const first = adapter('custom:first', ['.ZZ', '.aa']);
    const second = adapter('custom:second', ['.bb']);
    const registry = createLanguageRegistry([first, second]);
    expect(registry.cacheIdentity).toBe(createLanguageRegistry([second, first]).cacheIdentity);
    expect(registry.customForExtension('.AA')?.id).toBe(first.id);
    expect(registry.cacheIdentity).not.toBe(createLanguageRegistry([{ ...first, version: '2' }, second]).cacheIdentity);
    expect(first.extractImports).not.toHaveBeenCalled();
  });

  it.each([
    [adapter('python')],
    [adapter('custom:bad name')],
    [adapter('custom:one', ['.PY'])],
    [adapter('custom:one', ['.x', '.X'])],
    [adapter('custom:one', ['../x'])],
    [adapter('custom:one', [])],
    [adapter('custom:one'), adapter('custom:one', ['.other'])],
    [adapter('custom:one'), adapter('custom:two')],
    [{ ...adapter(), contractVersion: 2 }],
    [{ ...adapter(), version: '' }],
    [{ ...adapter(), resolveImport: undefined }]
  ])("rejects conflicting or invalid metadata without running callbacks: %#", (...entries) => {
    expect(() => createLanguageRegistry(entries as CustomLanguageAdapter[])).toThrow();
    for (const entry of entries) expect(entry.extractImports).not.toHaveBeenCalled();
  });

  it("copies and freezes metadata and keeps registries independent", () => {
    const original = adapter();
    const first = createLanguageRegistry([original]);
    original.version = 'changed';
    (original.extensions as string[])[0] = '.changed';
    original.extractImports = () => { throw new Error('replacement'); };
    const snapshot = first.customForExtension('.example')!;
    expect(snapshot.version).toBe('1.0.0');
    expect(snapshot.extractImports('')).toEqual([]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.extensions)).toBe(true);
    expect(Object.isFrozen(first.customAdapters)).toBe(true);
    const second = createLanguageRegistry([adapter('custom:other')]);
    expect(second.customForExtension('.example')?.id).toBe('custom:other');
    expect(first.customForExtension('.example')?.id).toBe('custom:example');
    expect(createLanguageRegistry().customForExtension('.example')).toBeUndefined();
  });
});
