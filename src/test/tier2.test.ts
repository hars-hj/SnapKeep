import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { describe, beforeEach, afterEach } from "node:test";
import { initRepo } from "../controllers/init.js";
import { addRepo } from "../controllers/add.js";
import { commitRepo } from "../controllers/commit.js";
import { revert } from "../controllers/revert.js";
import { statusRepo } from "../controllers/status.js";
import { diffRepo } from "../controllers/diff.js";
import { getHead, getIndex, readCommit } from "../utils/cas.js";
import {
  computeUnifiedDiff,
  getRepoStatus,
  loadIgnoreMatcher,
  scanWorkingTree,
} from "../utils/workspace.js";
import { saveGlobalConfig } from "../utils/globalConfig.js";

describe("Tier 2 (Part A & B) — Workspace, Status, Diff, and Safe Revert", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapkeep-tier2-test-"));
    process.chdir(tempDir);

    // Mock global user login
    await saveGlobalConfig({
      username: "testuser",
      userId: "u123",
      token: "mock-jwt-token",
      serverUrl: "http://localhost:3000",
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("loadIgnoreMatcher matches exact names, relative paths, wildcards, and default ignores", async () => {
    await fs.writeFile(
      path.join(tempDir, ".snapkeepignore"),
      `# Comment
dist
.env
build/output
*.log
`
    );

    const isIgnored = await loadIgnoreMatcher(tempDir);

    // Defaults
    assert.equal(isIgnored(".snapkeep"), true);
    assert.equal(isIgnored(".snapkeep/objects/12/34"), true);
    assert.equal(isIgnored(".git/config"), true);
    assert.equal(isIgnored("node_modules/pkg/index.js"), true);

    // Custom rules
    assert.equal(isIgnored("dist/bundle.js"), true);
    assert.equal(isIgnored(".env"), true);
    assert.equal(isIgnored("build/output/binary"), true);
    assert.equal(isIgnored("debug.log"), true);
    assert.equal(isIgnored("logs/nested/error.log"), true);

    // Non-ignored
    assert.equal(isIgnored("src/index.ts"), false);
    assert.equal(isIgnored("README.md"), false);
  });

  test("scanWorkingTree hashes files in memory without creating blobs in objects/", async () => {
    await fs.writeFile(path.join(tempDir, "file1.txt"), "hello world");
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "src", "app.ts"), "const x = 42;");

    const tree = await scanWorkingTree(tempDir);
    assert.equal(Object.keys(tree).length, 2);
    assert.ok(tree["file1.txt"]);
    assert.ok(tree["src/app.ts"]);

    // Ensure no objects directory was touched or created
    const objectsDir = path.join(tempDir, ".snapkeep", "objects");
    await assert.rejects(async () => fs.access(objectsDir));
  });

  test("computeUnifiedDiff produces correct diffs and detects binary files", () => {
    const oldBuf = Buffer.from("line 1\nline 2\nline 3\n");
    const newBuf = Buffer.from("line 1\nline 2 changed\nline 3\nline 4\n");

    const diff = computeUnifiedDiff("test.txt", oldBuf, newBuf);
    assert.ok(diff.includes("--- a/test.txt"));
    assert.ok(diff.includes("+++ b/test.txt"));
    assert.ok(diff.includes("-line 2"));
    assert.ok(diff.includes("+line 2 changed"));
    assert.ok(diff.includes("+line 4"));

    // Binary check
    const binBuf = Buffer.from([0x68, 0x65, 0x00, 0x6c]);
    const binDiff = computeUnifiedDiff("binary.bin", oldBuf, binBuf);
    assert.equal(binDiff, "Binary files a/binary.bin and b/binary.bin differ\n");
  });

  test("init creates .snapkeepignore on fresh init and handles re-initialization idempotently", async () => {
    // 1. Fresh init
    await initRepo();
    const ignorePath = path.join(tempDir, ".snapkeepignore");
    const ignoreContent = await fs.readFile(ignorePath, "utf-8");
    assert.ok(ignoreContent.includes("node_modules"));
    assert.ok(ignoreContent.includes("dist"));
    assert.ok(ignoreContent.includes("*.log"));

    // Add a commit
    await fs.writeFile(path.join(tempDir, "file.txt"), "v1");
    await addRepo({ files: ".", _: [], $0: "" } as any);
    await commitRepo({ message: "Init commit", _: [], $0: "" } as any);
    const initialHead = await getHead();

    // 2. Re-init
    await initRepo();
    // HEAD and index must NOT be overwritten
    assert.equal(await getHead(), initialHead);
    const index = await getIndex();
    assert.ok(index["file.txt"]);
  });

  test("status reports staged, unstaged, untracked, and clean states", async () => {
    await initRepo();

    // Initial clean check
    let status = await getRepoStatus();
    assert.equal(status.isClean, true);
    assert.equal(status.untracked.length, 0);

    // Create untracked file
    await fs.writeFile(path.join(tempDir, "untracked.txt"), "untracked");
    status = await getRepoStatus();
    assert.equal(status.isClean, false);
    assert.deepEqual(status.untracked, ["untracked.txt"]);

    // Stage it
    await addRepo({ files: "untracked.txt", _: [], $0: "" } as any);
    status = await getRepoStatus();
    assert.deepEqual(status.staged.added, ["untracked.txt"]);
    assert.equal(status.untracked.length, 0);

    // Commit
    await commitRepo({ message: "Add untracked", _: [], $0: "" } as any);
    status = await getRepoStatus();
    assert.equal(status.isClean, true);

    // Modify working tree
    await fs.writeFile(path.join(tempDir, "untracked.txt"), "modified");
    status = await getRepoStatus();
    assert.deepEqual(status.unstaged.modified, ["untracked.txt"]);

    // Test controller invocation without error
    await statusRepo();
  });

  test("diff compares workTree vs headTree and supports filtering by file", async () => {
    await initRepo();
    await fs.writeFile(path.join(tempDir, "file1.txt"), "original 1\n");
    await fs.writeFile(path.join(tempDir, "file2.txt"), "original 2\n");
    await addRepo({ files: ".", _: [], $0: "" } as any);
    await commitRepo({ message: "Initial", _: [], $0: "" } as any);

    await fs.writeFile(path.join(tempDir, "file1.txt"), "modified 1\n");
    await fs.writeFile(path.join(tempDir, "file2.txt"), "modified 2\n");

    // Test diff controllers
    await diffRepo({ file: "file1.txt", _: [], $0: "" } as any);
    await diffRepo({ _: [], $0: "" } as any);
  });

  test("revert safety check aborts on uncommitted changes without force or snapshot", async () => {
    await initRepo();
    await fs.writeFile(path.join(tempDir, "file.txt"), "v1\n");
    await addRepo({ files: ".", _: [], $0: "" } as any);
    await commitRepo({ message: "Commit 1", _: [], $0: "" } as any);
    const commit1 = (await getHead())!;

    await fs.writeFile(path.join(tempDir, "file.txt"), "v2\n");
    await addRepo({ files: ".", _: [], $0: "" } as any);
    await commitRepo({ message: "Commit 2", _: [], $0: "" } as any);
    const commit2 = (await getHead())!;

    // Make local dirty modification
    await fs.writeFile(path.join(tempDir, "file.txt"), "v2 dirty\n");

    // Revert without force or snapshot -> should abort
    await revert(commit1);
    assert.equal(await getHead(), commit2);
    assert.equal(await fs.readFile(path.join(tempDir, "file.txt"), "utf-8"), "v2 dirty\n");

    // Revert with force -> should succeed
    await revert(commit1, { force: true });
    assert.equal(await getHead(), commit1);
    assert.equal(await fs.readFile(path.join(tempDir, "file.txt"), "utf-8"), "v1\n");
  });

  test("revert with --snapshot creates auto-snapshot commit before reverting", async () => {
    await initRepo();
    await fs.writeFile(path.join(tempDir, "file.txt"), "commit 1\n");
    await addRepo({ files: ".", _: [], $0: "" } as any);
    await commitRepo({ message: "Commit 1", _: [], $0: "" } as any);
    const commit1 = (await getHead())!;

    await fs.writeFile(path.join(tempDir, "file.txt"), "commit 2\n");
    await addRepo({ files: ".", _: [], $0: "" } as any);
    await commitRepo({ message: "Commit 2", _: [], $0: "" } as any);

    // Uncommitted change
    await fs.writeFile(path.join(tempDir, "file.txt"), "uncommitted work\n");

    // Revert with --snapshot
    await revert(commit1, { snapshot: true });

    // Active HEAD is now commit1
    assert.equal(await getHead(), commit1);
    assert.equal(await fs.readFile(path.join(tempDir, "file.txt"), "utf-8"), "commit 1\n");

    // Verify snapshot commit was created in .snapkeep/commits/
    const commitsDir = path.join(tempDir, ".snapkeep", "commits");
    const commitFiles = await fs.readdir(commitsDir);
    assert.equal(commitFiles.length, 3); // commit 1, commit 2, and snapshot commit
  });

  test("revert supports 7+ char prefix matching and cleans up empty orphan parent directories", async () => {
    await initRepo();

    // Commit 1: file in nested dir
    await fs.mkdir(path.join(tempDir, "nested", "deep"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "nested", "deep", "nested.txt"), "nested content\n");
    await addRepo({ files: ".", _: [], $0: "" } as any);
    await commitRepo({ message: "Commit with nested file", _: [], $0: "" } as any);
    const commit1 = (await getHead())!;

    // Commit 2: delete nested file, add root file
    await fs.unlink(path.join(tempDir, "nested", "deep", "nested.txt"));
    await fs.rmdir(path.join(tempDir, "nested", "deep"));
    await fs.rmdir(path.join(tempDir, "nested"));
    await fs.writeFile(path.join(tempDir, "root.txt"), "root content\n");
    await addRepo({ files: ".", _: [], $0: "" } as any);
    await commitRepo({ message: "Commit 2", _: [], $0: "" } as any);
    const commit2 = (await getHead())!;

    // Revert to commit 1 using prefix -> nested/deep/nested.txt is restored
    const prefix1 = commit1.slice(0, 8);
    await revert(prefix1, { force: true });
    assert.equal(await getHead(), commit1);
    assert.equal(
      await fs.readFile(path.join(tempDir, "nested", "deep", "nested.txt"), "utf-8"),
      "nested content\n"
    );

    // Now revert from commit 1 to commit 2 using prefix -> nested file deleted and empty dirs removed
    const prefix2 = commit2.slice(0, 8);
    await revert(prefix2, { force: true });
    assert.equal(await getHead(), commit2);
    assert.equal(
      await fs.readFile(path.join(tempDir, "root.txt"), "utf-8"),
      "root content\n"
    );

    // Nested directory should have been removed because it is now empty
    await assert.rejects(async () => fs.access(path.join(tempDir, "nested")));
  });
});
