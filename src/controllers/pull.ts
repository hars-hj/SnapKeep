import axios from "axios";
import { checkLoggedIn } from "./checkloggedin.js";
import { checkRepoInitialized } from "./checkrepoinitialized.js";
import {
  CommitObject,
  getHead,
  hasCommit,
  hashBuffer,
  hashCommit,
  listLocalBlobs,
  listLocalCommits,
  readCommit,
  writeBlob,
  writeCommit,
} from "../utils/cas.js";
import { checkoutCommit } from "./revert.js";

const pullRepo = async () => {
  const config = await checkLoggedIn();
  const repoConfig = await checkRepoInitialized();
  if (!repoConfig) return;

  const username = config.username;
  const token = config.token;
  const reponame = repoConfig.name;
  const serverUrl = config.serverUrl || "http://localhost:3000";

  try {
    const knownCommits = await listLocalCommits();
    const knownBlobs = await listLocalBlobs();

    // Step 1 — Negotiate
    const negotiateRes = await axios.post(
      `${serverUrl}/pull/negotiate`,
      {
        username,
        reponame,
        knownCommits,
        knownBlobs,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const { remoteHead, commits, missingBlobs } = negotiateRes.data;

    // Fast-forward safety check on client
    const localHead = await getHead();

    if (!remoteHead) {
      console.log("Already up-to-date.");
      return;
    }

    if (localHead === remoteHead) {
      console.log("Already up-to-date.");
      return;
    }

    // Index received commits for lookup
    const commitsMap = new Map<string, CommitObject>();
    const commitEntries: [string, CommitObject][] = Array.isArray(commits)
      ? commits.map((c: any) => [c.hash || hashCommit(c), c])
      : Object.entries(commits || {});

    for (const [hash, commitObj] of commitEntries) {
      commitsMap.set(hash, commitObj);
    }

    // Verify fast-forward safety: localHead is null or in ancestry of remoteHead
    if (localHead !== null) {
      let isAncestor = false;
      let curr: string | null = remoteHead;
      const visited = new Set<string>();

      while (curr !== null) {
        if (curr === localHead) {
          isAncestor = true;
          break;
        }
        if (visited.has(curr)) {
          break;
        }
        visited.add(curr);

        if (commitsMap.has(curr)) {
          curr = commitsMap.get(curr)!.parent;
        } else if (await hasCommit(curr)) {
          const c = await readCommit(curr);
          curr = c.parent;
        } else {
          break;
        }
      }

      if (!isAncestor) {
        console.error("Pull aborted: local unpushed commits diverge from remote HEAD.");
        return;
      }
    }

    // Step 2 — Fetch Missing Blobs & Persist
    if (missingBlobs && missingBlobs.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < missingBlobs.length; i += BATCH_SIZE) {
        const batch = missingBlobs.slice(i, i + BATCH_SIZE);
        const fetchRes = await axios.post(
          `${serverUrl}/pull/fetch`,
          {
            username,
            reponame,
            blobs: batch,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          }
        );

        const fetchedBlobs = fetchRes.data.blobs || fetchRes.data;
        const blobEntries: [string, string][] = Array.isArray(fetchedBlobs)
          ? fetchedBlobs.map((b: any) => [b.hash, b.data || b.content || b.base64])
          : Object.entries(fetchedBlobs || {});

        for (const [blobHash, base64Data] of blobEntries) {
          const buf = Buffer.from(base64Data, "base64");
          const actualHash = hashBuffer(buf);
          if (actualHash !== blobHash.toLowerCase()) {
            throw new Error(
              `Blob integrity check failed during pull for ${blobHash}: computed ${actualHash}`
            );
          }
          await writeBlob(buf);
        }
      }
    }

    // Persist received commits
    for (const [commitHash, commitObj] of commitEntries) {
      const actualHash = hashCommit(commitObj);
      if (actualHash !== commitHash.toLowerCase()) {
        throw new Error(
          `Commit integrity check failed during pull for ${commitHash}: computed ${actualHash}`
        );
      }
      await writeCommit(commitObj);
    }

    // Step 3 — Checkout remoteHead to Workspace
    await checkoutCommit(remoteHead);
    console.log(`Pulled latest changes. HEAD is now at ${remoteHead}`);
  } catch (err: any) {
    console.error(
      "Error pulling from server:",
      err.response?.data?.message || err.message || err
    );
  }
};

export { pullRepo };
