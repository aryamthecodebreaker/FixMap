import type { RepoFile } from "./types.js";

export type RubyProject = {
  path: string;
  root: string;
  rspecEvidence: string[];
  minitestEvidence: string[];
  railsEvidence: string[];
  autoloadFiles: string[];
  rakeTestPath?: string;
  /** The Rake task that runs Minitest when it is not named "test" (Rake::TestTask.new(:unit)). */
  rakeTestTask?: string;
  /** Gemfiles of local gems this Gemfile pulls in with a literal `path:` option. */
  pathGems: string[];
};

export function buildRubyProjects(files: RepoFile[]): RubyProject[] {
  const manifests = files
    .filter((file) => file.path.split("/").pop()?.toLowerCase() === "gemfile")
    .sort((left, right) => left.path.localeCompare(right.path));
  const shells = manifests.map((file) => ({ path: file.path, root: directoryOf(file.path) }));
  const rubyEvidenceFiles = files.filter((file) => {
    const name = file.path.split("/").pop()?.toLowerCase() ?? "";
    return file.path.toLowerCase().endsWith(".rb") || file.path.toLowerCase().endsWith(".rake") ||
      name === "gemfile" || name === "rakefile" || name === ".rspec" || name.endsWith(".gemspec");
  });

  const projects: RubyProject[] = manifests.map((manifest) => {
    const root = directoryOf(manifest.path);
    const scoped = rubyEvidenceFiles.filter((file) => rubyProjectForPath(shells, file.path)?.path === manifest.path);
    const rspecEvidence = new Set<string>();
    const minitestEvidence = new Set<string>();
    const railsEvidence = new Set<string>();
    if (/^\s*gem\s*(?:\(|\s)\s*["']rspec(?:-[a-z0-9_-]+)?["']/im.test(manifest.textSample)) rspecEvidence.add(manifest.path);
    if (/^\s*gem\s*(?:\(|\s)\s*["']minitest["']/im.test(manifest.textSample)) minitestEvidence.add(manifest.path);
    if (/^\s*gem\s*(?:\(|\s)\s*["']rails["']/im.test(manifest.textSample)) railsEvidence.add(manifest.path);
    for (const file of scoped) {
      const relative = root ? file.path.slice(root.length + 1) : file.path;
      if (relative.toLowerCase() === ".rspec" || /(?:^|\/)spec\/(?:spec_helper|rails_helper)\.rb$/i.test(relative) || /_spec\.rb$/i.test(relative)) {
        rspecEvidence.add(file.path);
      }
      if (/(?:^|\/)test\/test_helper\.rb$/i.test(relative) || /_test\.rb$/i.test(relative) ||
        /^(?:\s*require\s*\(?\s*["']minitest|\s*class\s+[^\n<]+<\s*(?:Minitest::Test|MiniTest::Unit)\b)/m.test(file.textSample)) {
        minitestEvidence.add(file.path);
      }
    }
    const application = scoped.find((file) => {
      const relative = root ? file.path.slice(root.length + 1) : file.path;
      return relative.toLowerCase() === "config/application.rb" &&
        /\bclass\s+Application\s*<\s*Rails::Application\b/.test(file.textSample);
    });
    if (application) railsEvidence.add(application.path);
    // A Rails engine (class Engine < Rails::Engine under lib/) autoloads its own app/ the same way.
    const engine = scoped.find((file) => {
      const relative = root ? file.path.slice(root.length + 1) : file.path;
      return /^lib\/(?:.+\/)?engine\.rb$/i.test(relative) && /\bclass\s+Engine\s*<\s*(?:::)?Rails::Engine\b/.test(file.textSample);
    });
    if (engine) railsEvidence.add(engine.path);
    // An engine's Gemfile usually just says `gemspec`; its Rails dependency is in the gemspec.
    const gemspecRails = engine && /^\s*gemspec\b/m.test(manifest.textSample)
      ? scoped.find((file) => file.path.toLowerCase().endsWith(".gemspec") &&
        /\badd_(?:runtime_)?dependency\s*\(?\s*["'](?:rails|railties)["']/.test(file.textSample))
      : undefined;
    if (gemspecRails) railsEvidence.add(gemspecRails.path);
    const isRails = (railsEvidence.has(manifest.path) || Boolean(gemspecRails)) && (Boolean(application) || Boolean(engine));
    const extraRoots = application ? customAutoloadRoots(application.textSample, root) : { roots: [], ignored: [] };
    const autoloadFiles = isRails
      ? scoped.filter((file) => {
        if (!file.path.toLowerCase().endsWith(".rb")) return false;
        const relative = root ? file.path.slice(root.length + 1) : file.path;
        if (/^app\/(?!assets(?:\/|$)|javascript(?:\/|$)|views(?:\/|$))[^/]+\/.+\.rb$/i.test(relative)) return true;
        return extraRoots.roots.some((extra) => file.path.startsWith(`${extra}/`)) &&
          !extraRoots.ignored.some((ignored) => file.path.startsWith(`${ignored}/`));
      }).map((file) => file.path).sort((left, right) => left.localeCompare(right))
      : [];
    const rakefile = scoped.find((file) => file.path.split("/").pop()?.toLowerCase() === "rakefile");
    const rakeTasks = rakefile ? minitestRakeTasks(rakefile.textSample) : [];
    const rakeTestPath = rakefile && (rakeTasks.includes("test") || /\btask\s*(?:\(|\s)\s*:test\b/.test(rakefile.textSample))
      ? rakefile.path
      : undefined;
    const rakeTestTask = !rakeTestPath && rakefile && rakeTasks.length === 1 ? rakeTasks[0] : undefined;
    const pathGems = [...manifest.textSample.matchAll(/^\s*gem\s*\(?\s*["'][^"']+["'][^\n]*?\bpath\s*(?::|=>)\s*["']([^"'#$]+)["']/gm)]
      .map((match) => normalizeRelative(root, match[1] ?? ""))
      .filter((target): target is string => target !== undefined)
      .map((target) => manifests.find((candidate) => directoryOf(candidate.path) === target)?.path)
      .filter((path): path is string => path !== undefined && path !== manifest.path);
    return {
      path: manifest.path,
      root,
      rspecEvidence: [...rspecEvidence].sort((left, right) => left.localeCompare(right)),
      minitestEvidence: [...minitestEvidence].sort((left, right) => left.localeCompare(right)),
      railsEvidence: [...railsEvidence].sort((left, right) => left.localeCompare(right)),
      autoloadFiles,
      ...(rakeTestPath ? { rakeTestPath } : {}),
      ...(rakeTestTask && rakefile ? { rakeTestTask, rakeTestPath: rakefile.path } : {}),
      pathGems: [...new Set(pathGems)].sort((left, right) => left.localeCompare(right))
    };
  });
  // A host application sees the constants of the Rails engines it pulls in by path.
  const byPath = new Map(projects.map((project) => [project.path, project]));
  for (const project of projects) {
    if (project.autoloadFiles.length === 0) continue;
    const engineFiles = project.pathGems.flatMap((gemfile) => {
      const dependency = byPath.get(gemfile);
      return dependency && dependency.railsEvidence.some((path) => /\/engine\.rb$/i.test(path)) ? dependency.autoloadFiles : [];
    });
    if (engineFiles.length > 0) {
      project.autoloadFiles = [...new Set([...project.autoloadFiles, ...engineFiles])].sort((left, right) => left.localeCompare(right));
    }
  }
  return projects;
}

/**
 * Literal extra autoload roots from config/application.rb: config.autoload_lib(ignore: %w(...)),
 * and autoload_paths / eager_load_paths entries written as Rails.root.join("a", "b"),
 * "#{config.root}/a", "#{Rails.root}/a" or %W(#{config.root}/a ...). Anything computed stays unknown.
 */
function customAutoloadRoots(text: string, root: string): { roots: string[]; ignored: string[] } {
  const roots = new Set<string>();
  const ignored = new Set<string>();
  const add = (relative: string, target: Set<string>) => {
    const path = normalizeRelative(root, relative);
    if (path !== undefined && path !== root) target.add(path);
  };
  const autoloadLib = /\bconfig\.autoload_lib(?:_once)?\s*\(\s*ignore:\s*(?:%w[\[(]([^\])]*)[\])]|\[([^\]]*)\])\s*\)/.exec(text) ??
    (/\bconfig\.autoload_lib(?:_once)?\b(?!\s*\(\s*ignore)/.test(text) ? ["", ""] : null);
  if (autoloadLib) {
    add("lib", roots);
    const list = autoloadLib[1] ?? (autoloadLib[2] ?? "").replace(/["':]/g, " ");
    for (const entry of list.split(/[\s,]+/).filter(Boolean)) add(`lib/${entry}`, ignored);
  }
  for (const statement of text.matchAll(/\bconfig\.(?:autoload|eager_load)_paths\s*(?:<<|\+=|\.push\(|\.concat\()\s*([^\n]+)/g)) {
    const value = statement[1] ?? "";
    for (const join of value.matchAll(/Rails\.root\.join\(([^)]*)\)/g)) {
      const parts = [...(join[1] ?? "").matchAll(/["']([^"'#$]+)["']/g)].map((part) => part[1]!);
      if (parts.length > 0 && parts.length === (join[1] ?? "").split(",").length) add(parts.join("/"), roots);
    }
    for (const interpolated of value.matchAll(/#\{(?:config\.root|Rails\.root)\}\/([A-Za-z0-9_./-]+)/g)) add(interpolated[1]!, roots);
  }
  return { roots: [...roots].sort(), ignored: [...ignored].sort() };
}

/** Minitest tasks a Rakefile defines with Rake::TestTask.new; an unnamed task is "test". */
function minitestRakeTasks(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(/\bRake::TestTask\.new\b\s*(\(\s*(?::([A-Za-z_][A-Za-z0-9_]*)|["']([A-Za-z0-9_:-]+)["'])?[^)]*\))?/g)) {
    names.add(match[2] ?? match[3] ?? "test");
  }
  return [...names].sort();
}

function normalizeRelative(root: string, value: string): string | undefined {
  const trimmed = value.trim().replace(/\\/g, "/").replace(/\/$/, "");
  if (!trimmed || /^[A-Za-z]:|^\//.test(trimmed) || /[*?$\0]/.test(trimmed)) return undefined;
  const segments = root.split("/").filter(Boolean);
  for (const segment of trimmed.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return undefined;
      segments.pop();
    } else segments.push(segment);
  }
  return segments.join("/");
}

export function rubyProjectForPath<T extends { path: string; root: string }>(
  projects: T[],
  path: string
): T | undefined {
  const matching = projects.filter((project) => project.root ? path.startsWith(`${project.root}/`) : true);
  if (matching.length === 0) return undefined;
  const deepest = Math.max(...matching.map((project) => depth(project.root)));
  const nearest = matching.filter((project) => depth(project.root) === deepest);
  return nearest.length === 1 ? nearest[0] : undefined;
}

export function rubyTestCommandForProject(
  project: RubyProject,
  relatedTests: string[] = []
): { command: string; reason: string; scopeDir?: string } | undefined {
  const relatedRspec = relatedTests.filter((path) => /_spec\.rb$/i.test(path));
  const relatedMinitest = relatedTests.filter((path) => /_test\.rb$/i.test(path));
  if (relatedRspec.length > 0 && relatedMinitest.length > 0) return undefined;
  const useRspec = relatedRspec.length > 0 ||
    (relatedMinitest.length === 0 && project.rspecEvidence.length > 0 && project.minitestEvidence.length === 0);
  const useMinitest = relatedMinitest.length > 0 ||
    (relatedRspec.length === 0 && project.minitestEvidence.length > 0 && project.rspecEvidence.length === 0);
  if (useRspec && project.rspecEvidence.length > 0) {
    return {
      command: scopedBundleCommand(project.root, "rspec"),
      reason: `${project.rspecEvidence[0]} provides RSpec test evidence for ${project.path}`,
      scopeDir: project.root
    };
  }
  if (useMinitest && project.minitestEvidence.length > 0) {
    if (project.rakeTestPath) {
      const task = project.rakeTestTask ?? "test";
      return {
        command: scopedBundleCommand(project.root, `rake ${task}`),
        reason: project.rakeTestTask
          ? `${project.path} has Minitest evidence and ${project.rakeTestPath} declares its only Minitest task, "${task}"`
          : `${project.path} has Minitest evidence and ${project.rakeTestPath} declares a test task`,
        scopeDir: project.root
      };
    }
    const testPath = relatedMinitest[0] ?? project.minitestEvidence.find((path) => /_test\.rb$/i.test(path));
    if (!testPath) return undefined;
    const relative = project.root ? testPath.slice(project.root.length + 1) : testPath;
    return {
      command: scopedBundleCommand(project.root, `ruby -Itest ${relative}`),
      reason: `${testPath} provides executable Minitest evidence for ${project.path}`,
      scopeDir: project.root
    };
  }
  return undefined;
}

function scopedBundleCommand(root: string, command: string): string {
  return root ? `ruby -C ${root} -S bundle exec ${command}` : `bundle exec ${command}`;
}

function directoryOf(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

function depth(path: string): number {
  return path.split("/").filter(Boolean).length;
}
