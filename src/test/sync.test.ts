import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test, { describe, beforeEach, afterEach } from "node:test";
import { initRepo } from "../controllers/init.js";
import { addRepo } from "../controllers/add.js";
import { commitRepo } from "../controllers/commit.js";
import { pushRepo } from "../controllers/push.js";
import { pullRepo } from "../controllers/pull.js";
import { getHead, getIndex, readCommit } from "../utils/cas.js";
import { saveGlobalConfig } from "../utils/globalConfig.js";

describe("Phase 4 — Client Negotiation Sync (push & pull)", () => {
  let tempDir: string;
  let originalCwd: string;
  let server: http.Server;
  let serverPort: number;
  let serverRequests: { url: string; method: string; headers: any; body: any }[] = [];
  let negotiatePushResponse: any = null;
  let negotiatePushStatus = 200;
  let uploadPushStatus = 200;
  let negotiatePullResponse: any = null;
  let fetchPullResponse: any = null;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapkeep-sync-test-"));
    process.chdir(tempDir);

    serverRequests = [];
    negotiatePushStatus = 200;
    uploadPushStatus = 200;
    negotiatePushResponse = null;
    negotiatePullResponse = null;
    fetchPullResponse = null;

    server = http.createServer((req, res) => {
      let data = "";
      req.on("data", (chunk) => {
        data += chunk;
      });
      req.on("end", () => {
        const parsedBody = data ? JSON.parse(data) : null;
        serverRequests.push({
          url: req.url || "",
          method: req.method || "",
          headers: req.headers,
          body: parsedBody,
        });

        if (req.url === "/push/negotiate") {
          res.writeHead(negotiatePushStatus, { "Content-Type": "application/json" });
          res.end(JSON.stringify(negotiatePushResponse || { remoteHead: null, missingCommits: [], missingBlobs: [] }));
        } else if (req.url === "/push/upload") {
          res.writeHead(uploadPushStatus, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } else if (req.url === "/pull/negotiate") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(negotiatePullResponse || { remoteHead: null, commits: {}, missingBlobs: [] }));
        } else if (req.url === "/pull/fetch") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(fetchPullResponse || { blobs: {} }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as any;
        serverPort = address.port;
        resolve();
      });
    });

    // Mock global user login
    await saveGlobalConfig({
      username: "testuser",
      userId: "u123",
      token: "mock-jwt-token",
      serverUrl: `http://127.0.0.1:${serverPort}`,
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("push uploads missing commits and blobs with Bearer token authentication", async () => {
    await initRepo();
    await fs.writeFile(path.join(tempDir, "hello.txt"), "Hello VCS Sync!\n");
    await addRepo({ files: ".", _: [], $0: "" } as any);
    await commitRepo({ message: "Initial sync commit", _: [], $0: "" } as any);

    const clientHead = (await getHead())!;

    negotiatePushResponse = {
      remoteHead: null,
      missingCommits: [clientHead],
      missingBlobs: Object.values((await readCommit(clientHead)).tree),
    };

    await pushRepo();

    assert.equal(serverRequests.length, 2);

    // Verify /push/negotiate request
    const req1 = serverRequests[0];
    assert.equal(req1.url, "/push/negotiate");
    assert.equal(req1.headers["authorization"], "Bearer mock-jwt-token");
    assert.equal(req1.body.username, "testuser");
    assert.equal(req1.body.clientHead, clientHead);
    assert.deepEqual(req1.body.commits, [clientHead]);
    assert.equal(req1.body.blobs.length, 1);

    // Verify /push/upload request
    const req2 = serverRequests[1];
    assert.equal(req2.url, "/push/upload");
    assert.equal(req2.headers["authorization"], "Bearer mock-jwt-token");
    assert.equal(req2.body.newHead, clientHead);
    assert.ok(req2.body.commits[clientHead]);
    assert.equal(Object.keys(req2.body.blobs).length, 1);
  });

  test("push handles 409 Conflict cleanly", async () => {
    await initRepo();
    await fs.writeFile(path.join(tempDir, "file.txt"), "Conflict test\n");
    await addRepo({ files: ".", _: [], $0: "" } as any);
    await commitRepo({ message: "Local commit", _: [], $0: "" } as any);

    negotiatePushStatus = 409;
    negotiatePushResponse = { message: "Push rejected: non-fast-forward. Pull latest changes first." };

    await pushRepo();

    // Only negotiation occurred, no upload
    assert.equal(serverRequests.length, 1);
  });

  test("pull fetches missing blobs, persists commits, and checks out remoteHead", async () => {
    await initRepo();

    const remoteFileContent = Buffer.from("Remote content from server\n", "utf-8");
    const remoteBlobHash = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
    // We compute the actual SHA-256 for integrity verification
    const crypto = await import("crypto");
    const actualBlobHash = crypto.createHash("sha256").update(remoteFileContent).digest("hex");

    const remoteCommitObj = {
      tree: { "remote.txt": actualBlobHash },
      parent: null,
      message: "Remote commit",
      date: "2026-10-31T05:00:00.000Z",
    };
    const { hashCommit } = await import("../utils/cas.js");
    const remoteHead = hashCommit(remoteCommitObj);

    negotiatePullResponse = {
      remoteHead,
      commits: { [remoteHead]: remoteCommitObj },
      missingBlobs: [actualBlobHash],
    };

    fetchPullResponse = {
      blobs: {
        [actualBlobHash]: remoteFileContent.toString("base64"),
      },
    };

    await pullRepo();

    assert.equal(await getHead(), remoteHead);
    const index = await getIndex();
    assert.equal(index["remote.txt"], actualBlobHash);

    // Verify file written to workspace
    const contentOnDisk = await fs.readFile(path.join(tempDir, "remote.txt"), "utf-8");
    assert.equal(contentOnDisk, "Remote content from server\n");
  });

  test("pull aborts if local unpushed commits diverge from remote HEAD", async () => {
    await initRepo();

    // Create a local diverged commit
    await fs.writeFile(path.join(tempDir, "local.txt"), "local divergence\n");
    await addRepo({ files: ".", _: [], $0: "" } as any);
    await commitRepo({ message: "Local diverged commit", _: [], $0: "" } as any);
    const localHead = (await getHead())!;

    // Remote head is an entirely unrelated commit
    const remoteCommitObj = {
      tree: {},
      parent: null,
      message: "Remote root",
      date: "2026-10-31T06:00:00.000Z",
    };
    const { hashCommit } = await import("../utils/cas.js");
    const remoteHead = hashCommit(remoteCommitObj);

    negotiatePullResponse = {
      remoteHead,
      commits: { [remoteHead]: remoteCommitObj },
      missingBlobs: [],
    };

    await pullRepo();

    // HEAD must NOT have moved because it diverges
    assert.equal(await getHead(), localHead);
  });
});

