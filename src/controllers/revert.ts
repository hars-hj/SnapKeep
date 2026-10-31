import path from "path";
import { promises as fs } from "fs";
import { checkLoggedIn } from "./checkloggedin.js";
import { checkRepoInitialized } from "./checkrepoinitialized.js";
import {
  getHead,
  getIndex,
  hasCommit,
  readBlob,
  readCommit,
  saveIndex,
  setHead,
} from "../utils/cas.js";

const revert = async (commitID: string) => {
  await checkLoggedIn();
  if (!(await checkRepoInitialized())) return;

  try {
    if (!(await hasCommit(commitID))) {
      throw new Error(`Commit '${commitID}' does not exist.`);
    }

    const targetCommit = await readCommit(commitID);

    // Read current HEAD commit (if any) and current index to identify tracked files
    const head = await getHead();
    const trackedFiles = new Set<string>();

    const currentIndex = await getIndex();
    for (const file of Object.keys(currentIndex)) {
      trackedFiles.add(file);
    }

    if (head) {
      try {
        const headCommit = await readCommit(head);
        for (const file of Object.keys(headCommit.tree)) {
          trackedFiles.add(file);
        }
      } catch {
        // proceed with index if head commit is inaccessible
      }
    }

    const repoRoot = process.cwd();

    // Delete any tracked workspace files that are NOT in targetCommit.tree
    for (const relPath of trackedFiles) {
      if (!Object.prototype.hasOwnProperty.call(targetCommit.tree, relPath)) {
        if (relPath.startsWith(".snapkeep") || relPath === ".snapkeepignore") {
          continue;
        }

        const fullPath = path.join(repoRoot, relPath);
        try {
          await fs.rm(fullPath, { force: true });
        } catch {
          // ignore if already deleted
        }
      }
    }

    // Restore files from targetCommit.tree
    for (const [relPath, blobHash] of Object.entries(targetCommit.tree)) {
      const buf = await readBlob(blobHash);
      const destPath = path.join(repoRoot, relPath);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, buf);
    }

    // Update .snapkeep/index.json and .snapkeep/HEAD
    await saveIndex(targetCommit.tree);
    await setHead(commitID);

    console.log(`commit with commitId: ${commitID} reverted`);
  } catch (err: any) {
    console.error("Unable to revert commit: ", err.message || err);
  }
};

export { revert };
