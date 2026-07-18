import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildIsolatedGitEnvironment,
  buildReportForRepository,
  parseRepositorySource,
  withRepositorySource,
  type ClonedRepository
} from "../src/repository-source.js";

const localFixtures: string[] = [];
const REVISION = "0123456789abcdef0123456789abcdef01234567";

afterEach(async () => {
  await Promise.all(localFixtures.splice(0).map((path) =>
    rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  ));
});

async function createFixture(root: string): Promise<void> {
  await mkdir(join(root, "src", "auth"), { recursive: true });
  await mkdir(join(root, "test", "auth"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
  await writeFile(
    join(root, "src", "auth", "reset-password.ts"),
    "export function sendResetEmail(email: string) { return email; }\n"
  );
  await writeFile(
    join(root, "test", "auth", "reset-password.test.ts"),
    "import '../../src/auth/reset-password';\n"
  );
}

async function fixtureClone(
  _url: string,
  destination: string
): Promise<ClonedRepository> {
  await createFixture(destination);
  return { ref: "main", revision: REVISION };
}

describe("repository source parsing", () => {
  it.each([
    "https://github.com/owner/repository",
    "https://github.com/owner/repository/",
    "https://github.com/owner/repository.git",
    "https://github.com/owner/repository.git/"
  ])("accepts a canonical public GitHub repository URL: %s", (input) => {
    expect(parseRepositorySource(input)).toEqual({
      kind: "github",
      displayUrl: "https://github.com/owner/repository",
      cloneUrl: "https://github.com/owner/repository.git"
    });
  });

  it.each([
    "http://github.com/owner/repository",
    "git://github.com/owner/repository",
    "ssh://git@github.com/owner/repository",
    "git@github.com:owner/repository.git",
    "file:///tmp/repository",
    "https://gitlab.com/owner/repository",
    "https://github.com.evil.example/owner/repository",
    "https://github.com/owner/repository/tree/main",
    "https://github.com/owner/repository?ref=main",
    "https://github.com/owner/repository#readme",
    "https://user:secret@github.com/owner/repository",
    "https://github.com/owner/repository%2Ftree",
    "https://github.com/owner/repository%5Ctree",
    "https://github.com/owner\\repository",
    "https://github.com/owner/repository\n",
    "github.com/owner/repository"
  ])("rejects unsupported or unsafe repository input: %s", (input) => {
    expect(() => parseRepositorySource(input)).toThrow();
  });

  it("keeps Windows drive paths in the local-path branch", () => {
    expect(parseRepositorySource("C:\\work\\repository").kind).toBe("local");
  });
});

describe("Git process isolation", () => {
  it("removes inherited credential and askpass helpers without mutating the parent environment", () => {
    const inheritedEnvironment: NodeJS.ProcessEnv = {
      PATH: "C:\\tools",
      HTTPS_PROXY: "https://proxy.example",
      GIT_ASKPASS: "C:\\helpers\\git-askpass.exe",
      git_config_count: "1",
      GitHub_Token: "fake-github-token",
      GH_TOKEN: "fake-gh-token",
      ssh_askpass: "C:\\helpers\\ssh-askpass.exe",
      SSH_ASKPASS_REQUIRE: "force",
      SUDO_ASKPASS: "C:\\helpers\\sudo-askpass.exe",
      home: "C:\\Users\\someone",
      UserProfile: "C:\\Users\\someone"
    };
    const originalEnvironment = { ...inheritedEnvironment };

    const isolatedEnvironment = buildIsolatedGitEnvironment(
      inheritedEnvironment,
      "C:\\isolated-home",
      "C:\\isolated-home\\gitconfig"
    );

    expect(isolatedEnvironment).toMatchObject({
      PATH: "C:\\tools",
      HTTPS_PROXY: "https://proxy.example",
      GCM_INTERACTIVE: "Never",
      GIT_CONFIG_GLOBAL: "C:\\isolated-home\\gitconfig",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_LFS_SKIP_SMUDGE: "1",
      GIT_TERMINAL_PROMPT: "0",
      HOME: "C:\\isolated-home",
      USERPROFILE: "C:\\isolated-home",
      XDG_CONFIG_HOME: "C:\\isolated-home"
    });
    expect(
      Object.keys(isolatedEnvironment).filter((name) =>
        name.toUpperCase().includes("ASKPASS") ||
        ["GH_TOKEN", "GITHUB_TOKEN"].includes(name.toUpperCase())
      )
    ).toEqual([]);
    expect(
      Object.keys(isolatedEnvironment).filter((name) =>
        ["HOME", "USERPROFILE", "XDG_CONFIG_HOME"].includes(name.toUpperCase())
      )
    ).toEqual(["HOME", "USERPROFILE", "XDG_CONFIG_HOME"]);
    expect(inheritedEnvironment).toEqual(originalEnvironment);
  });
});

describe("repository acquisition", () => {
  it("preserves local-directory behavior", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-local-source-"));
    localFixtures.push(root);
    await createFixture(root);

    const report = await buildReportForRepository({
      repo: root,
      issueText: "password reset emails fail"
    });

    expect(report.contextFiles[0]?.path).toBe("src/auth/reset-password.ts");
    expect(report.diagnostics.some((diagnostic) => diagnostic.code === "remote-repo-fetched")).toBe(false);
  });

  it("analyzes a temporary GitHub checkout and removes it before returning", async () => {
    let checkoutRoot = "";

    const report = await buildReportForRepository({
      repo: "https://github.com/owner/repository",
      issueText: "password reset emails fail"
    }, {
      clonePublicRepository: async (url, destination) => {
        checkoutRoot = destination;
        expect(url).toBe("https://github.com/owner/repository.git");
        return fixtureClone(url, destination);
      }
    });

    expect(report.contextFiles[0]?.path).toBe("src/auth/reset-password.ts");
    expect(report.diagnostics[0]).toMatchObject({
      code: "remote-repo-fetched",
      severity: "info"
    });
    expect(report.diagnostics[0]?.message).toContain(`main@${REVISION}`);
    await expect(stat(dirname(checkoutRoot))).rejects.toThrow();
  });

  it("rejects remote diff analysis before cloning", async () => {
    const clonePublicRepository = vi.fn(fixtureClone);

    await expect(buildReportForRepository({
      repo: "https://github.com/owner/repository",
      issueText: "password reset emails fail",
      diffSpec: "main...HEAD"
    }, { clonePublicRepository })).rejects.toThrow("Git diff options are not supported");

    expect(clonePublicRepository).not.toHaveBeenCalled();
  });

  it("removes the temporary directory after clone failure", async () => {
    let checkoutRoot = "";

    await expect(buildReportForRepository({
      repo: "https://github.com/owner/missing",
      issueText: "password reset emails fail"
    }, {
      clonePublicRepository: async (_url, destination) => {
        checkoutRoot = destination;
        throw new Error("repository not found");
      }
    })).rejects.toThrow("repository was not found or is not publicly accessible");

    await expect(stat(dirname(checkoutRoot))).rejects.toThrow();
  });

  it.each([
    {
      error: Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" }),
      expected: "Git is not installed"
    },
    {
      error: Object.assign(new Error("Command timed out"), { killed: true }),
      expected: "120-second timeout"
    },
    {
      error: new Error("fatal: Needed a single revision"),
      expected: "no default-branch commit"
    }
  ])("returns a stable clone error: $expected", async ({ error, expected }) => {
    await expect(buildReportForRepository({
      repo: "https://github.com/owner/repository",
      issueText: "password reset emails fail"
    }, {
      clonePublicRepository: async () => {
        throw error;
      }
    })).rejects.toThrow(expected);
  });

  it("removes the temporary directory when analysis fails", async () => {
    const source = parseRepositorySource("https://github.com/owner/repository");
    let checkoutRoot = "";

    await expect(withRepositorySource(source, async () => {
      throw new Error("analysis failed");
    }, {
      clonePublicRepository: async (url, destination) => {
        checkoutRoot = destination;
        return fixtureClone(url, destination);
      }
    })).rejects.toThrow("analysis failed");

    await expect(stat(dirname(checkoutRoot))).rejects.toThrow();
  });

  it("turns cleanup failure into a hard error instead of returning a report", async () => {
    let temporaryRoot = "";
    const makeTemporaryDirectory = async (prefix: string) => {
      temporaryRoot = await mkdtemp(prefix);
      return temporaryRoot;
    };

    try {
      await expect(buildReportForRepository({
        repo: "https://github.com/owner/repository",
        issueText: "password reset emails fail"
      }, {
        clonePublicRepository: fixtureClone,
        makeTemporaryDirectory,
        removeTemporaryDirectory: async () => {
          throw new Error("directory is locked");
        }
      })).rejects.toThrow("Could not remove temporary checkout");
    } finally {
      if (temporaryRoot) {
        await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      }
    }
  });

  it("uses isolated temporary directories for concurrent calls", async () => {
    const checkoutRoots: string[] = [];
    const clonePublicRepository = async (url: string, destination: string) => {
      checkoutRoots.push(destination);
      return fixtureClone(url, destination);
    };

    const reports = await Promise.all([
      buildReportForRepository({
        repo: "https://github.com/owner/first",
        issueText: "password reset emails fail"
      }, { clonePublicRepository }),
      buildReportForRepository({
        repo: "https://github.com/owner/second",
        issueText: "password reset emails fail"
      }, { clonePublicRepository })
    ]);

    expect(reports).toHaveLength(2);
    expect(new Set(checkoutRoots).size).toBe(2);
    await Promise.all(checkoutRoots.map((path) => expect(stat(dirname(path))).rejects.toThrow()));
  });
});
