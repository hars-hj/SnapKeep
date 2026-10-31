import fs from "fs/promises";
import path from "path";
import type { ArgumentsCamelCase } from "yargs";
import { checkRepoInitialized } from "./checkrepoinitialized.js";
import {
  getHead,
  getIndex,
  readBlob,
  readCommit,
  toPosixPath,
} from "../utils/cas.js";
import { computeUnifiedDiff, scanWorkingTree } from "../utils/workspace.js";

type DiffArgs = {
  file?: string;
};

export const diffRepo = async (argv: ArgumentsCamelCase<DiffArgs>) => {
  if (!(await checkRepoInitialized())) return;

  const repoRoot = process.cwd();
  let targetFile: string | null = null;
  if (argv.file) {
    const absPath = path.resolve(repoRoot, argv.file);
    targetFile = toPosixPath(path.relative(repoRoot, absPath));
  }

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

  const indexTree = await getIndex();
  const workTree = await scanWorkingTree(repoRoot);

  // Union of headTree and workTree
  const allPaths = new Set([
    ...Object.keys(headTree),
    ...Object.keys(workTree),
  ]);
  const sortedPaths = Array.from(allPaths).sort();

  for (const p of sortedPaths) {
    if (targetFile && p !== targetFile) {
      continue;
    }

    // Exclude untracked files unless they are staged in indexTree
    const isTracked = p in headTree || p in indexTree;
    if (!isTracked) {
      continue;
    }

    // If headTree[p] === workTree[p], skip immediately in O(1)
    if (headTree[p] && workTree[p] && headTree[p] === workTree[p]) {
      continue;
    }

    let oldBuf: Buffer | null = null;
    let newBuf: Buffer | null = null;

    if (headTree[p]) {
      try {
        oldBuf = await readBlob(headTree[p]);
      } catch {
        oldBuf = null;
      }
    }

    if (workTree[p]) {
      try {
        newBuf = await fs.readFile(path.join(repoRoot, p));
      } catch {
        newBuf = null;
      }
    }

    const diffOutput = computeUnifiedDiff(p, oldBuf, newBuf);
    if (diffOutput) {
      process.stdout.write(diffOutput);
    }
  }
};

