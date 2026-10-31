import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { describe, beforeEach, afterEach } from "node:test";
import {
  CommitObject,
  getBlobPath,
  getCommitPath,
  getCommitsDir,
  getHead,
  getIndex,
  getObjectsDir,
  getSnapkeepDir,
  hasBlob,
  hasCommit,
  hashBuffer,
  hashCommit,
  listLocalBlobs,
  listLocalCommits,
  readBlob,
  readCommit,
  saveIndex,
  serializeCommit,
  setHead,
  toPosixPath,
  writeBlob,
  writeCommit,
} from "../utils/cas.js";

describe("Content-Addressable Storage (CAS) & Commit Utilities", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapkeep-cas-test-"));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("Path helpers produce expected relative paths", () => {
    const snapkeepDir = getSnapkeepDir();
    assert.equal(snapkeepDir, path.join(tempDir, ".snapkeep"));
    assert.equal(getObjectsDir(), path.join(tempDir, ".snapkeep", "objects"));
    assert.equal(getCommitsDir(), path.join(tempDir, ".snapkeep", "commits"));

    const sampleHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    assert.equal(
      getBlobPath(sampleHash),
      path.join(tempDir, ".snapkeep", "objects", "01", "23456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
    );
    assert.equal(
      getCommitPath(sampleHash),
      path.join(tempDir, ".snapkeep", "commits", `${sampleHash}.json`)
    );

    assert.equal(toPosixPath("src\\utils\\cas.ts"), "src/utils/cas.ts");
    assert.equal(toPosixPath("src/utils/cas.ts"), "src/utils/cas.ts");
  });

  test("writeBlob writes content with fanout and deduplicates identical blobs", async () => {
    const content = Buffer.from("console.log('hello world');\n", "utf-8");
    const expectedHash = hashBuffer(content);

    assert.equal(expectedHash.length, 64);
    assert.equal(await hasBlob(expectedHash), false);

    const hash1 = await writeBlob(content);
    assert.equal(hash1, expectedHash);
    assert.equal(await hasBlob(expectedHash), true);

    const blobFile = getBlobPath(expectedHash);
    const stat1 = await fs.stat(blobFile);

    // Deduplication check: second write of the same buffer returns same hash without overwriting
    const hash2 = await writeBlob(content);
    assert.equal(hash2, expectedHash);
    const stat2 = await fs.stat(blobFile);
    assert.equal(stat1.mtimeMs, stat2.mtimeMs);

    // Read blob and verify content
    const retrieved = await readBlob(expectedHash);
    assert.deepEqual(retrieved, content);
  });

  test("readBlob detects data corruption and throws integrity error", async () => {
    const content = Buffer.from("immutable data", "utf-8");
    const hash = await writeBlob(content);
    const blobFile = getBlobPath(hash);

    // Tamper with the blob file
    await fs.writeFile(blobFile, Buffer.from("tampered data", "utf-8"));

    await assert.rejects(
      async () => {
        await readBlob(hash);
      },
      {
        name: "Error",
        message: new RegExp(`Blob integrity check failed for ${hash}`),
      }
    );
  });

  test("serializeCommit and hashCommit are deterministic regardless of tree key insertion order", () => {
    const commitA: CommitObject = {
      tree: {
        "src/z.ts": "1111111111111111111111111111111111111111111111111111111111111111",
        "src/a.ts": "2222222222222222222222222222222222222222222222222222222222222222",
        "README.md": "3333333333333333333333333333333333333333333333333333333333333333",
      },
      parent: null,
      message: "Initial commit",
      date: "2026-10-31T00:00:00.000Z",
    };

    const commitB: CommitObject = {
      tree: {
        "README.md": "3333333333333333333333333333333333333333333333333333333333333333",
        "src/a.ts": "2222222222222222222222222222222222222222222222222222222222222222",
        "src/z.ts": "1111111111111111111111111111111111111111111111111111111111111111",
      },
      parent: null,
      message: "Initial commit",
      date: "2026-10-31T00:00:00.000Z",
    };

    const serializedA = serializeCommit(commitA);
    const serializedB = serializeCommit(commitB);

    assert.equal(serializedA, serializedB);

    // Verify top-level key order in JSON
    const parsedKeys = Object.keys(JSON.parse(serializedA));
    assert.deepEqual(parsedKeys, ["tree", "parent", "message", "date"]);

    // Verify tree keys are sorted
    const treeKeys = Object.keys(JSON.parse(serializedA).tree);
    assert.deepEqual(treeKeys, ["README.md", "src/a.ts", "src/z.ts"]);

    const hashA = hashCommit(commitA);
    const hashB = hashCommit(commitB);
    assert.equal(hashA, hashB);
    assert.equal(hashA.length, 64);
  });

  test("writeCommit and readCommit store and retrieve commits with integrity verification", async () => {
    const commit: CommitObject = {
      tree: {
        "index.ts": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      parent: null,
      message: "feat: first commit",
      date: new Date().toISOString(),
    };

    assert.equal(await hasCommit(hashCommit(commit)), false);

    const hash = await writeCommit(commit);
    assert.equal(await hasCommit(hash), true);

    const loaded = await readCommit(hash);
    assert.deepEqual(loaded, commit);

    // Corrupt commit file
    const commitFile = getCommitPath(hash);
    await fs.writeFile(commitFile, JSON.stringify({ ...commit, message: "tampered" }, null, 2));

    await assert.rejects(
      async () => {
        await readCommit(hash);
      },
      {
        name: "Error",
        message: new RegExp(`Commit integrity check failed for ${hash}`),
      }
    );
  });

  test("HEAD and Index management works correctly", async () => {
    // HEAD empty initially
    assert.equal(await getHead(), null);

    const fakeHash = "4444444444444444444444444444444444444444444444444444444444444444";
    await setHead(fakeHash);
    assert.equal(await getHead(), fakeHash);

    // Index empty initially
    assert.deepEqual(await getIndex(), {});

    const indexData = {
      "src/index.ts": "5555555555555555555555555555555555555555555555555555555555555555",
      "package.json": "6666666666666666666666666666666666666666666666666666666666666666",
    };

    await saveIndex(indexData);
    const loadedIndex = await getIndex();
    assert.deepEqual(loadedIndex, indexData);

    // Verify index keys are saved sorted on disk
    const raw = await fs.readFile(path.join(getSnapkeepDir(), "index.json"), "utf-8");
    const parsedKeys = Object.keys(JSON.parse(raw));
    assert.deepEqual(parsedKeys, ["package.json", "src/index.ts"]);
  });

  test("listLocalCommits walks the parent chain back to root", async () => {
    assert.deepEqual(await listLocalCommits(), []);

    // Commit 1 (root)
    const commit1: CommitObject = {
      tree: {},
      parent: null,
      message: "Root commit",
      date: "2026-10-31T01:00:00.000Z",
    };
    const hash1 = await writeCommit(commit1);

    // Commit 2 (child of commit 1)
    const commit2: CommitObject = {
      tree: { "file1.txt": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      parent: hash1,
      message: "Second commit",
      date: "2026-10-31T02:00:00.000Z",
    };
    const hash2 = await writeCommit(commit2);

    // Commit 3 (child of commit 2)
    const commit3: CommitObject = {
      tree: {
        "file1.txt": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "file2.txt": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
      parent: hash2,
      message: "Third commit",
      date: "2026-10-31T03:00:00.000Z",
    };
    const hash3 = await writeCommit(commit3);

    await setHead(hash3);

    const history = await listLocalCommits();
    assert.deepEqual(history, [hash3, hash2, hash1]);
  });

  test("listLocalBlobs finds and enumerates all local 64-char blob hashes", async () => {
    assert.deepEqual(await listLocalBlobs(), []);

    const blobA = Buffer.from("Blob content A");
    const blobB = Buffer.from("Blob content B");
    const blobC = Buffer.from("Blob content C");

    const hashA = await writeBlob(blobA);
    const hashB = await writeBlob(blobB);
    const hashC = await writeBlob(blobC);

    const foundBlobs = await listLocalBlobs();
    const expected = [hashA, hashB, hashC].sort();

    assert.deepEqual(foundBlobs, expected);
  });
});

