import { describe, expect, it } from "vitest";
import { buildImportGraph } from "../src/import-graph.js";
import { buildRubyProjects, rubyTestCommandForProject } from "../src/ruby-projects.js";
import type { RepoFile } from "../src/types.js";

function file(path: string, textSample: string): RepoFile {
  return {
    path,
    extension: path.includes(".") ? path.slice(path.lastIndexOf(".")) : "",
    sizeBytes: textSample.length,
    isSource: true,
    isTest: /_(?:test|spec)\.rb$/.test(path),
    kind: path.endsWith(".rb") ? "code" : "config",
    textSample
  };
}

const rails = (body = "") => file("config/application.rb", `module Shop\n  class Application < Rails::Application\n${body}\n  end\nend\n`);

describe("Rails autoload, engines and Rake tasks", () => {
  it("adds literal custom autoload roots and autoload_lib with its ignore list", () => {
    const [project] = buildRubyProjects([
      file("Gemfile", 'gem "rails"\n'),
      rails([
        "    config.autoload_lib(ignore: %w(assets tasks))",
        '    config.autoload_paths << Rails.root.join("extras", "billing")',
        '    config.eager_load_paths += %W(#{config.root}/services)',
        "    config.autoload_paths << some_computed_path"
      ].join("\n")),
      file("app/models/order.rb", "class Order\nend\n"),
      file("lib/pricing.rb", "class Pricing\nend\n"),
      file("lib/tasks/seed.rb", "class Seed\nend\n"),
      file("extras/billing/invoice.rb", "class Invoice\nend\n"),
      file("services/mailer.rb", "class Mailer\nend\n"),
      file("other/stray.rb", "class Stray\nend\n")
    ]);
    expect(project!.autoloadFiles).toEqual([
      "app/models/order.rb", "extras/billing/invoice.rb", "lib/pricing.rb", "services/mailer.rb"
    ]);
  });

  it("indexes declared constants, so acronym inflections need no inflector config", () => {
    const graph = buildImportGraph([
      file("Gemfile", 'gem "rails"\n'),
      rails(),
      file("app/services/html_parser.rb", "class HTMLParser\n  def call; end\nend\n"),
      file("app/controllers/pages_controller.rb", "class PagesController\n  def show\n    HTMLParser.new.call\n  end\nend\n")
    ]);
    expect([...(graph.imports.get("app/controllers/pages_controller.rb") ?? [])]).toEqual(["app/services/html_parser.rb"]);
  });

  it("autoloads a path-gem engine's app/ for its host and links the Gemfiles", () => {
    const files = [
      file("Gemfile", 'gem "rails"\ngem "billing", path: "engines/billing"\n'),
      rails(),
      file("app/controllers/checkout_controller.rb", "class CheckoutController\n  def create\n    Billing::Charge.call\n  end\nend\n"),
      file("engines/billing/Gemfile", "source \"https://rubygems.org\"\ngemspec\n"),
      file("engines/billing/billing.gemspec", 'Gem::Specification.new do |spec|\n  spec.add_dependency "rails", ">= 7.1"\nend\n'),
      file("engines/billing/lib/billing/engine.rb", "module Billing\n  class Engine < ::Rails::Engine\n    isolate_namespace Billing\n  end\nend\n"),
      file("engines/billing/app/models/billing/charge.rb", "module Billing\n  class Charge\n    def self.call; end\n  end\nend\n")
    ];
    const projects = buildRubyProjects(files);
    const engine = projects.find((project) => project.path === "engines/billing/Gemfile")!;
    const host = projects.find((project) => project.path === "Gemfile")!;
    expect(engine.autoloadFiles).toEqual(["engines/billing/app/models/billing/charge.rb"]);
    expect(host.pathGems).toEqual(["engines/billing/Gemfile"]);
    expect(host.autoloadFiles).toContain("engines/billing/app/models/billing/charge.rb");
    const graph = buildImportGraph(files);
    expect([...(graph.imports.get("Gemfile") ?? [])]).toEqual(["engines/billing/Gemfile"]);
    expect([...(graph.imports.get("app/controllers/checkout_controller.rb") ?? [])]).toContain("engines/billing/app/models/billing/charge.rb");
  });

  it("routes Minitest through the only custom-named Rake::TestTask, and fails closed on several", () => {
    const route = (rakefile: string) => rubyTestCommandForProject(buildRubyProjects([
      file("Gemfile", 'gem "minitest"\n'),
      file("Rakefile", rakefile),
      file("test/order_test.rb", "require 'minitest/autorun'\nclass OrderTest < Minitest::Test\nend\n")
    ])[0]!);
    expect(route("Rake::TestTask.new(:unit) do |t|\n  t.pattern = 'test/**/*_test.rb'\nend\n")?.command).toBe("bundle exec rake unit");
    expect(route("Rake::TestTask.new do |t|\nend\n")?.command).toBe("bundle exec rake test");
    expect(route("Rake::TestTask.new(:unit)\nRake::TestTask.new(:integration)\n")?.command).toBe("bundle exec ruby -Itest test/order_test.rb");
  });
});
