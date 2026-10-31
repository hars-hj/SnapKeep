import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { describe, beforeEach, afterEach } from "node:test";
import { initRepo } from "../controllers/init.js";
import { addRepo } from "../controllers/add.js";
import { commitRepo } from "../controllers/commit.js";
import { getLogs } from "../controllers/log.js";
import { revert } from "../controllers/revert.js";
import { getHead, getIndex, readCommit } from "../utils/cas.js";

describe("Phase 2 — Refactored Local Commands", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapkeep-cmd-test-"));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("init creates CAS folders, empty HEAD, and empty index without staging/", async () => {
    await initRepo();

    const snapkeepPath = path.join(tempDir, ".snapkeep");
    const objectsPath = path.join(snapkeepPath, "objects");
    const commitsPath = path.join(snapkeepPath, "commits");
    const headPath = path.join(snapkeepPath, "HEAD");
    const indexPath = path.join(snapkeepPath, "index.json");
    const stagingPath = path.join(snapkeepPath, "staging");
    const configPath = path.join(snapkeepPath, "config.json");

    assert.equal(await fs.stat(objectsPath).then((s) => s.isDirectory()), true);
    assert.equal(await fs.stat(commitsPath).then((s) => s.isDirectory()), true);
    assert.equal(await fs.readFile(headPath, "utf-8"), "");
    assert.equal(await fs.readFile(indexPath, "utf-8"), "{}");
    assert.equal(await fs.stat(configPath).then((s) => s.isFile()), true);

    // Ensure staging/ is NOT created
    await assert.rejects(async () => {
      await fs.stat(stagingPath);
    });
  });

  test("add and commit store files as CAS blobs and create a commit chain", async () => {
    await initRepo();

    // Create project files
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "src", "index.ts"), "console.log('v1');\n");
    await fs.writeFile(path.join(tempDir, "README.md"), "# Test Repo\n");

    // Add single file
    await addRepo({ files: path.join("src", "index.ts"), _: [], $0: "" } as any);

    let index = await getIndex();
    assert.equal(Object.keys(index).length, 1);
    assert.ok(index["src/index.ts"]);

    // Add another file
    await addRepo({ files: "README.md", _: [], $0: "" } as any);
    index = await getIndex();
    assert.equal(Object.keys(index).length, 2);
    assert.ok(index["README.md"]);

    // Commit 1
    await commitRepo({ message: "Initial commit", _: [], $0: "" } as any);
    const head1 = await getHead();
    assert.ok(head1);
    assert.equal(head1.length, 64);

    const commit1 = await readCommit(head1);
    assert.equal(commit1.parent, null);
    assert.equal(commit1.message, "Initial commit");
    assert.equal(Object.keys(commit1.tree).length, 2);

    // Modify a file and add it
    await fs.writeFile(path.join(tempDir, "src", "index.ts"), "console.log('v2');\n");
    await addRepo({ files: path.join("src", "index.ts"), _: [], $0: "" } as any);

    // Commit 2
    await commitRepo({ message: "Update index.ts", _: [], $0: "" } as any);
    const head2 = await getHead();
    assert.ok(head2);
    assert.notEqual(head1, head2);

    const commit2 = await readCommit(head2);
    assert.equal(commit2.parent, head1);
    assert.equal(commit2.message, "Update index.ts");

    // Try committing clean working tree (no-op)
    await commitRepo({ message: "No changes", _: [], $0: "" } as any);
    assert.equal(await getHead(), head2);
  });

  test("add . removes deleted files from the index and respects .snapkeepignore", async () => {
    await initRepo();

    // Setup ignore file
    await fs.writeFile(path.join(tempDir, ".snapkeepignore"), "ignored.txt\nnode_modules\n");
    await fs.writeFile(path.join(tempDir, "file1.txt"), "File 1\n");
    await fs.writeFile(path.join(tempDir, "file2.txt"), "File 2\n");
    await fs.writeFile(path.join(tempDir, "ignored.txt"), "Should be ignored\n");

    // Add all files via '.'
    await addRepo({ files: ".", _: [], $0: "" } as any);
    let index = await getIndex();

    assert.ok(index["file1.txt"]);
    assert.ok(index["file2.txt"]);
    assert.equal(index["ignored.txt"], undefined);

    await commitRepo({ message: "Add file1 and file2", _: [], $0: "" } as any);

    // Delete file2.txt from disk
    await fs.unlink(path.join(tempDir, "file2.txt"));

    // Add . should detect the deletion and remove file2.txt from index
    await addRepo({ files: ".", _: [], $0: "" } as any);
    index = await getIndex();
    assert.ok(index["file1.txt"]);
    assert.equal(index["file2.txt"], undefined);
  });

  test("revert restores target files, removes deleted tracked files, and updates HEAD/index", async () => {
    await initRepo();

    // Commit 1: fileA.txt and shared.txt
    await fs.writeFile(path.join(tempDir, "fileA.txt"), "Version A\n");
    await fs.writeFile(path.join(tempDir, "shared.txt"), "Shared V1\n");
    await addRepo({ files: ".", _: [], $0: "" } as any);
    await commitRepo({ message: "Commit 1", _: [], $0: "" } as any);
    const commitId1 = (await getHead())!;

    // Commit 2: delete fileA.txt, add fileB.txt, modify shared.txt
    await fs.unlink(path.join(tempDir, "fileA.txt"));
    await fs.writeFile(path.join(tempDir, "fileB.txt"), "Version B\n");
    await fs.writeFile(path.join(tempDir, "shared.txt"), "Shared V2\n");
    await addRepo({ files: ".", _: [], $0: "" } as any);
    await commitRepo({ message: "Commit 2", _: [], $0: "" } as any);
    const commitId2 = (await getHead())!;

    assert.notEqual(commitId1, commitId2);

    // Revert to Commit 1
    await revert(commitId1);

    // Verification
    assert.equal(await getHead(), commitId1);
    const index = await getIndex();
    assert.ok(index["fileA.txt"]);
    assert.ok(index["shared.txt"]);
    assert.equal(index["fileB.txt"], undefined);

    // Verify files on disk
    assert.equal(await fs.readFile(path.join(tempDir, "fileA.txt"), "utf-8"), "Version A\n");
    assert.equal(await fs.readFile(path.join(tempDir, "shared.txt"), "utf-8"), "Shared V1\n");

    // fileB.txt should have been deleted from disk because it wasn't in commit 1
    await assert.rejects(async () => {
      await fs.stat(path.join(tempDir, "fileB.txt"));
    });
  });

  test("logs prints the commit chain history", async () => {
    await initRepo();

    // No commits yet
    await getLogs();

    await fs.writeFile(path.join(tempDir, "test.txt"), "hello\n");
    await addRepo({ files: ".", _: [], $0: "" } as any);
    await commitRepo({ message: "First message", _: [], $0: "" } as any);

    await fs.writeFile(path.join(tempDir, "test.txt"), "hello world\n");
    await addRepo({ files: ".", _: [], $0: "" } as any);
    await commitRepo({ message: "Second message", _: [], $0: "" } as any);

    // Call getLogs to verify execution without error
    await getLogs();
  });
});

