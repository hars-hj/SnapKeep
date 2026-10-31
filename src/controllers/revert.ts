import path from "path";
import { promises as fs } from "fs";
import { checkLoggedIn } from "./checkloggedin.js";
import { checkRepoInitialized } from "./checkrepoinitialized.js";
import {
  CommitObject,
  getCommitsDir,
  getHead,
  getIndex,
  hasCommit,
  readBlob,
  readCommit,
  saveIndex,
  setHead,
  writeBlob,
  writeCommit,
} from "../utils/cas.js";
import { getRepoStatus, scanWorkingTree } from "../utils/workspace.js";

export async function resolveCommitId(commitID: string): Promise<string> {
  if (commitID.length === 64 && (await hasCommit(commitID))) {
    return commitID;
  }

  if (commitID.length < 7) {
    throw new Error(
      `Commit prefix '${commitID}' is too short (minimum 7 characters).`
    );
  }

  const commitsDir = getCommitsDir();
  let entries;
  try {
    entries = await fs.readdir(commitsDir);
  } catch {
    throw new Error(`Commit '${commitID}' does not exist.`);
  }

  const prefix = commitID.toLowerCase();
  const matches = entries
    .filter((e) => e.endsWith(".json") && e.toLowerCase().startsWith(prefix))
    .map((e) => e.replace(/\.json$/, ""));

  if (matches.length === 0) {
    throw new Error(`Commit '${commitID}' does not exist.`);
  }

  if (matches.length > 1) {
    throw new Error(
      `Ambiguous commit prefix '${commitID}' matches ${matches.length} commits: ${matches.join(
        ", "
      )}`
    );
  }

  return matches[0];
}

export async function checkoutCommitTree(
  targetCommit: CommitObject,
  resolvedCommitHash: string
): Promise<void> {
  const headHash = await getHead();
  let headTree: Record<string, string> = {};
  if (headHash) {
    try {
      const headCommit = await readCommit(headHash);
      headTree = headCommit.tree || {};
    } catch {
      headTree = {};
    }
  }

  const currentIndex = await getIndex();
  const trackedPaths = new Set([
    ...Object.keys(headTree),
    ...Object.keys(currentIndex),
  ]);

  const cwd = process.cwd();

  // 1. Delete files not in targetCommit.tree
  for (const relPath of trackedPaths) {
    if (!(relPath in targetCommit.tree)) {
      if (relPath.startsWith(".snapkeep") || relPath === ".snapkeepignore") {
        continue;
      }
      const fullPath = path.join(cwd, relPath);
      try {
        await fs.unlink(fullPath);
      } catch {
        // ignore if already deleted
      }

      // Walk parent directories upward toward cwd and delete if empty
      let currentDir = path.dirname(fullPath);
      while (currentDir !== cwd && currentDir.startsWith(cwd)) {
        try {
          const files = await fs.readdir(currentDir);
          if (files.length === 0) {
            await fs.rmdir(currentDir);
            currentDir = path.dirname(currentDir);
          } else {
            break;
          }
        } catch {
          break;
        }
      }
    }
  }

  // 2. Write/Update files from targetCommit.tree
  const workTree = await scanWorkingTree(cwd);
  for (const [relPath, targetBlobHash] of Object.entries(targetCommit.tree)) {
    if (workTree[relPath] === targetBlobHash) {
      continue;
    }

    const buf = await readBlob(targetBlobHash);
    const destPath = path.join(cwd, relPath);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, buf);
  }

  // 3. Update metadata
  await saveIndex(targetCommit.tree);
  await setHead(resolvedCommitHash);
}

export async function checkoutCommit(commitID: string): Promise<void> {
  const resolved = await resolveCommitId(commitID);
  const targetCommit = await readCommit(resolved);
  await checkoutCommitTree(targetCommit, resolved);
}

export interface RevertOptions {
  force?: boolean;
  snapshot?: boolean;
}

const revert = async (commitID: string, options?: RevertOptions) => {
  await checkLoggedIn();
  if (!(await checkRepoInitialized())) return;

  let resolvedCommitHash: string;
  try {
    resolvedCommitHash = await resolveCommitId(commitID);
  } catch (err: any) {
    console.error(`Error: ${err.message || err}`);
    return;
  }

  try {
    const targetCommit = await readCommit(resolvedCommitHash);
    const headHash = await getHead();
    let headTree: Record<string, string> = {};
    if (headHash) {
      try {
        const headCommit = await readCommit(headHash);
        headTree = headCommit.tree || {};
      } catch {
        headTree = {};
      }
    }

    const status = await getRepoStatus();
    const workTree = await scanWorkingTree(process.cwd());
    const currentIndex = await getIndex();

    // Tracked dirty changes (staged or unstaged vs HEAD)
    const dirtyTrackedFiles = Array.from(
      new Set([
        ...status.staged.added,
        ...status.staged.modified,
        ...status.staged.deleted,
        ...status.unstaged.modified,
        ...status.unstaged.deleted,
        ...status.vsHead.modified,
        ...status.vsHead.deleted,
        ...status.vsHead.added.filter((f) => f in currentIndex || f in headTree),
      ])
    ).sort();

    // Colliding untracked files
    const collidingUntracked = status.untracked
      .filter(
        (f) =>
          Object.prototype.hasOwnProperty.call(targetCommit.tree, f) &&
          workTree[f] !== targetCommit.tree[f]
      )
      .sort();

    if (
      (dirtyTrackedFiles.length > 0 || collidingUntracked.length > 0) &&
      !options?.force
    ) {
      if (options?.snapshot) {
        // Automatically stage and create a backup snapshot commit
        const snapshotIndex: Record<string, string> = {
          ...headTree,
          ...currentIndex,
        };

        for (const f of Object.keys(workTree)) {
          if (f in snapshotIndex || f in headTree || f in currentIndex) {
            const buf = await fs.readFile(path.join(process.cwd(), f));
            const blobHash = await writeBlob(buf);
            snapshotIndex[f] = blobHash;
          }
        }

        for (const f of Object.keys(snapshotIndex)) {
          if (!(f in workTree)) {
            delete snapshotIndex[f];
          }
        }

        await saveIndex(snapshotIndex);

        const snapshotCommitObj: CommitObject = {
          tree: snapshotIndex,
          parent: headHash,
          message: `Auto-snapshot before revert to ${resolvedCommitHash.slice(
            0,
            8
          )}`,
          date: new Date().toISOString(),
        };

        const snapshotHash = await writeCommit(snapshotCommitObj);
        await setHead(snapshotHash);
        console.log(
          `Created auto-snapshot commit ${snapshotHash} (you can restore it anytime with: snapkeep revert ${snapshotHash})`
        );
      } else {
        console.error(
          "Error: Revert aborted. Your uncommitted changes or untracked files would be overwritten:"
        );
        const allAffected = Array.from(
          new Set([...dirtyTrackedFiles, ...collidingUntracked])
        ).sort();
        for (const f of allAffected) {
          console.error(`  ${f}`);
        }
        console.error(
          "Commit your changes first, run 'snapkeep revert <id> --snapshot' to auto-save a backup commit, or use '--force' to discard local changes."
        );
        return;
      }
    }

    await checkoutCommitTree(targetCommit, resolvedCommitHash);
    console.log(
      `Reverted working directory to commit ${resolvedCommitHash.slice(
        0,
        12
      )} (${targetCommit.message})`
    );
  } catch (err: any) {
    console.error("Unable to revert commit: ", err.message || err);
  }
};

export { revert };
