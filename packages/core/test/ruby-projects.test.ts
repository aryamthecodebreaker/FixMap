import { describe, expect, it } from "vitest";
import {
  buildRubyProjects,
  rubyProjectForPath,
  rubyTestCommandForProject
} from "../src/ruby-projects.js";
import type { RepoFile } from "../src/types.js";

function file(path: string, textSample = "", isTest = false): RepoFile {
  return {
    path,
    extension: path.includes(".") ? path.slice(path.lastIndexOf(".")) : "",
    sizeBytes: textSample.length,
    isSource: true,
    isTest,
    kind: path.endsWith(".rb") ? "code" : "config",
    textSample
  };
}

describe("Ruby project evidence", () => {
  it("does not turn a bare Gemfile into an invented RSpec command", () => {
    const project = buildRubyProjects([
      file("Gemfile", 'source "https://rubygems.org"\n'),
      file("lib/token.rb", "class Token; end\n")
    ])[0]!;

    expect(project.rspecEvidence).toEqual([]);
    expect(project.minitestEvidence).toEqual([]);
    expect(rubyTestCommandForProject(project)).toBeUndefined();
  });

  it("does not treat commented Gem declarations as runner evidence", () => {
    const project = buildRubyProjects([
      file("Gemfile", '# gem "rspec"\n# gem "minitest"\n'),
      file("lib/token.rb", "class Token; end\n")
    ])[0]!;

    expect(project.rspecEvidence).toEqual([]);
    expect(project.minitestEvidence).toEqual([]);
  });

  it("derives RSpec only from repository evidence", () => {
    const project = buildRubyProjects([
      file("Gemfile", 'gem "rspec-rails"\n'),
      file("spec/token_spec.rb", "RSpec.describe Token do; end\n", true)
    ])[0]!;

    expect(rubyTestCommandForProject(project)).toEqual({
      command: "bundle exec rspec",
      reason: "Gemfile provides RSpec test evidence for Gemfile",
      scopeDir: ""
    });
  });

  it("routes Minitest through a declared Rake test task", () => {
    const project = buildRubyProjects([
      file("Gemfile", 'gem "minitest"\n'),
      file("Rakefile", "Rake::TestTask.new(:test)\n"),
      file("test/token_test.rb", "class TokenTest < Minitest::Test; end\n", true)
    ])[0]!;

    expect(rubyTestCommandForProject(project)).toEqual({
      command: "bundle exec rake test",
      reason: "Gemfile has Minitest evidence and Rakefile declares a test task",
      scopeDir: ""
    });
  });

  it("routes an exact Minitest file when no Rake test task exists", () => {
    const project = buildRubyProjects([
      file("services/api/Gemfile", 'gem "minitest"\n'),
      file("services/api/test/token_test.rb", "class TokenTest < Minitest::Test; end\n", true)
    ])[0]!;

    expect(rubyTestCommandForProject(project, ["services/api/test/token_test.rb"])).toEqual({
      command: "ruby -C services/api -S bundle exec ruby -Itest test/token_test.rb",
      reason: "services/api/test/token_test.rb provides executable Minitest evidence for services/api/Gemfile",
      scopeDir: "services/api"
    });
  });

  it("fails closed for mixed frameworks unless related tests select exactly one", () => {
    const project = buildRubyProjects([
      file("Gemfile", 'gem "rspec"\ngem "minitest"\n'),
      file("spec/token_spec.rb", "RSpec.describe Token do; end\n", true),
      file("test/token_test.rb", "class TokenTest < Minitest::Test; end\n", true)
    ])[0]!;

    expect(rubyTestCommandForProject(project)).toBeUndefined();
    expect(rubyTestCommandForProject(project, ["spec/token_spec.rb"])?.command).toBe("bundle exec rspec");
    expect(rubyTestCommandForProject(project, ["spec/token_spec.rb", "test/token_test.rb"])).toBeUndefined();
  });

  it("selects the deepest unambiguous Gemfile owner", () => {
    const projects = buildRubyProjects([
      file("Gemfile", 'gem "rspec"\n'),
      file("services/api/Gemfile", 'gem "minitest"\n')
    ]);

    expect(rubyProjectForPath(projects, "services/api/lib/token.rb")?.path).toBe("services/api/Gemfile");
    expect(rubyProjectForPath(projects, "lib/token.rb")?.path).toBe("Gemfile");
  });
});
