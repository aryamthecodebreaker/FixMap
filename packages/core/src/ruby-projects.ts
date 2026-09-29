import type { RepoFile } from "./types.js";

export type RubyProject = {
  path: string;
  root: string;
  rspecEvidence: string[];
  minitestEvidence: string[];
  railsEvidence: string[];
  autoloadFiles: string[];
  rakeTestPath?: string;
};

export function buildRubyProjects(files: RepoFile[]): RubyProject[] {
  const manifests = files
    .filter((file) => file.path.split("/").pop()?.toLowerCase() === "gemfile")
    .sort((left, right) => left.path.localeCompare(right.path));
  const shells = manifests.map((file) => ({ path: file.path, root: directoryOf(file.path) }));
  const rubyEvidenceFiles = files.filter((file) => {
    const name = file.path.split("/").pop()?.toLowerCase() ?? "";
    return file.path.toLowerCase().endsWith(".rb") || file.path.toLowerCase().endsWith(".rake") ||
      name === "gemfile" || name === "rakefile" || name === ".rspec";
  });

  return manifests.map((manifest) => {
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
    const autoloadFiles = railsEvidence.size === 2
      ? scoped.filter((file) => {
        const relative = root ? file.path.slice(root.length + 1) : file.path;
        return /^app\/(?!assets(?:\/|$)|javascript(?:\/|$)|views(?:\/|$))[^/]+\/.+\.rb$/i.test(relative);
      }).map((file) => file.path).sort((left, right) => left.localeCompare(right))
      : [];
    const rakefile = scoped.find((file) => file.path.split("/").pop()?.toLowerCase() === "rakefile");
    const rakeTestPath = rakefile && /\b(?:Rake::TestTask|task\s*(?:\(|\s)\s*:test\b)/.test(rakefile.textSample)
      ? rakefile.path
      : undefined;
    return {
      path: manifest.path,
      root,
      rspecEvidence: [...rspecEvidence].sort((left, right) => left.localeCompare(right)),
      minitestEvidence: [...minitestEvidence].sort((left, right) => left.localeCompare(right)),
      railsEvidence: [...railsEvidence].sort((left, right) => left.localeCompare(right)),
      autoloadFiles,
      ...(rakeTestPath ? { rakeTestPath } : {})
    };
  });
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
      return {
        command: scopedBundleCommand(project.root, "rake test"),
        reason: `${project.path} has Minitest evidence and ${project.rakeTestPath} declares a test task`,
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
