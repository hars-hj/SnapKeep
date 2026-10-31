import axios from "axios";
import { checkLoggedIn } from "./checkloggedin.js";
import { checkRepoInitialized } from "./checkrepoinitialized.js";
import {
  CommitObject,
  getHead,
  listLocalCommits,
  readBlob,
  readCommit,
} from "../utils/cas.js";

const pushRepo = async () => {
  const config = await checkLoggedIn();
  const repoConfig = await checkRepoInitialized();
  if (!repoConfig) return;

  const username = config.username;
  const token = config.token;
  const reponame = repoConfig.name;
  const serverUrl = config.serverUrl || "http://localhost:3000";

  const clientHead = await getHead();
  if (!clientHead) {
    console.log("Nothing to push (no commits yet).");
    return;
  }

  try {
    const commits = await listLocalCommits();
    const blobSet = new Set<string>();
    for (const commitHash of commits) {
      const commitObj = await readCommit(commitHash);
      for (const blobHash of Object.values(commitObj.tree)) {
        blobSet.add(blobHash);
      }
    }
    const blobs = Array.from(blobSet);

    // Step 1 — Negotiate
    let negotiateRes;
    try {
      negotiateRes = await axios.post(
        `${serverUrl}/push/negotiate`,
        {
          username,
          reponame,
          clientHead,
          commits,
          blobs,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (err: any) {
      if (err.response && err.response.status === 409) {
        const msg =
          err.response.data?.message ||
          err.response.data?.error ||
          "Push rejected: non-fast-forward. Pull latest changes first.";
        console.error(msg);
        return;
      }
      throw err;
    }

    const { remoteHead, missingCommits, missingBlobs } = negotiateRes.data;

    if (
      remoteHead === clientHead &&
      (!missingCommits || missingCommits.length === 0) &&
      (!missingBlobs || missingBlobs.length === 0)
    ) {
      console.log("Everything up-to-date.");
      return;
    }

    // Step 2 — Upload Missing Objects
    const commitsPayload: Record<string, CommitObject> = {};
    if (missingCommits && Array.isArray(missingCommits)) {
      for (const hash of missingCommits) {
        commitsPayload[hash] = await readCommit(hash);
      }
    }

    const blobsPayload: Record<string, string> = {};
    if (missingBlobs && Array.isArray(missingBlobs)) {
      for (const hash of missingBlobs) {
        const buf = await readBlob(hash);
        blobsPayload[hash] = buf.toString("base64");
      }
    }

    try {
      await axios.post(
        `${serverUrl}/push/upload`,
        {
          username,
          reponame,
          expectedRemoteHead: remoteHead,
          newHead: clientHead,
          commits: commitsPayload,
          blobs: blobsPayload,
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
    } catch (err: any) {
      if (err.response && err.response.status === 409) {
        const msg =
          err.response.data?.message ||
          err.response.data?.error ||
          "Push rejected: non-fast-forward. Pull latest changes first.";
        console.error(msg);
        return;
      }
      throw err;
    }

    const commitsCount = missingCommits ? missingCommits.length : 0;
    const blobsCount = missingBlobs ? missingBlobs.length : 0;
    console.log(
      `Push successful: HEAD -> ${clientHead} (${commitsCount} commits, ${blobsCount} blobs uploaded)`
    );
  } catch (err: any) {
    console.error(
      "Error pushing to server:",
      err.response?.data?.message || err.message || err
    );
  }
};

export { pushRepo };
