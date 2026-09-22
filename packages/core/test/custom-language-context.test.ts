import { describe, expect, it, vi } from "vitest";
import { createCustomLanguageContext } from "../src/custom-language-context.js";
import { createLanguageRegistry, type CustomLanguageAdapter } from "../src/language-registry.js";

function adapter(): CustomLanguageAdapter {
  return { id: 'custom:example', contractVersion: 1, version: '1', extensions: ['.example'],
    extractImports: vi.fn(() => []), extractDefinitions: vi.fn(() => []),
    isTestPath: vi.fn(() => false), resolveImport: () => [] };
}
const file = () => ({ path: 'src/a.example', extension: '.example', textSample: 'hello' });

describe('custom language extraction context', () => {
  it('distinguishes unsupported, empty, and failed extraction', () => {
    const plugin = adapter();
    const context = createCustomLanguageContext(createLanguageRegistry([plugin]));
    expect(context.extract({ ...file(), extension: '.py' })).toEqual({ status: 'unsupported' });
    expect(context.extract(file())).toMatchObject({ status: 'ok', facts: { imports: [], definitions: [], adapter: plugin.id, version: '1' } });
    const broken = createCustomLanguageContext(createLanguageRegistry([{ ...plugin, extractImports() { throw new Error('SECRET'); } }]));
    expect(broken.extract(file())).toEqual({ status: 'failed', adapter: plugin.id, code: 'adapter-extraction-failed' });
  });

  it('isolates cached facts from consumers and retained plugin output', () => {
    const imports = [{ specifier: './b', importedNames: ['Value'], wildcard: false }];
    const plugin = { ...adapter(), extractImports: vi.fn(() => imports) };
    const context = createCustomLanguageContext(createLanguageRegistry([plugin]));
    const input = file();
    const first = context.extract(input);
    if (first.status !== 'ok') throw new Error('Expected facts');
    first.facts.imports[0]!.importedNames.push('Fake');
    imports[0]!.specifier = './poison';
    expect(context.extract(input)).toMatchObject({ facts: { imports: [{ specifier: './b', importedNames: ['Value'] }] } });
    expect(plugin.extractImports).toHaveBeenCalledTimes(1);
    input.textSample = 'changed';
    context.extract(input);
    expect(plugin.extractImports).toHaveBeenCalledTimes(2);
    input.path = 'tests/a.example';
    context.extract(input);
    expect(plugin.extractImports).toHaveBeenCalledTimes(3);
  });

  it.each([
    { extractImports: () => [{ adapter: 'python', specifier: './x', importedNames: [], wildcard: false }] },
    { extractImports: () => [{ specifier: './x', importedNames: [], wildcard: 'yes' }] },
    { extractImports: () => Array(2001).fill({ specifier: 'x', importedNames: [], wildcard: false }) },
    { extractDefinitions: () => [{ name: 'x', kind: 'function', offset: 5 }] },
    { extractDefinitions: () => [{ name: 'x', kind: 'invented' }] },
    { isTestPath: () => 'true' }
  ])('rejects malformed batches: %#', (override) => {
    const context = createCustomLanguageContext(createLanguageRegistry([{ ...adapter(), ...override } as CustomLanguageAdapter]));
    expect(context.extract(file()).status).toBe('failed');
  });

  it('bounds inputs before calling plugins and separates registries', () => {
    const plugin = adapter();
    const context = createCustomLanguageContext(createLanguageRegistry([plugin]));
    expect(context.extract({ ...file(), textSample: 'x'.repeat(64001) })).toMatchObject({ code: 'adapter-input-invalid' });
    expect(context.extract({ ...file(), path: '../a.example' })).toMatchObject({ code: 'adapter-input-invalid' });
    expect(plugin.extractImports).not.toHaveBeenCalled();
    const second = createCustomLanguageContext(createLanguageRegistry([{ ...adapter(), version: '2' }]));
    const input = file();
    expect(context.extract(input)).toMatchObject({ facts: { version: '1' } });
    expect(second.extract(input)).toMatchObject({ facts: { version: '2' } });
  });
});
