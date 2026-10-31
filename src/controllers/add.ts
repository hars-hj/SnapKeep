import { promises as fs } from "fs";
import path from "path";
import type { ArgumentsCamelCase } from "yargs";
import { checkLoggedIn } from "./checkloggedin.js";
import { checkRepoInitialized } from "./checkrepoinitialized.js";
import {
  getHead,
  getIndex,
  readCommit,
  saveIndex,
  toPosixPath,
  writeBlob,
} from "../utils/cas.js";
import { loadIgnoreMatcher } from "../utils/workspace.js";

type AddArgs = {
  files: string;
};

async function collectFiles(
  dir: string,
  repoRoot: string,
  isIgnored: (relPath: string) => boolean
): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const rel = toPosixPath(path.relative(repoRoot, fullPath));
    if (isIgnored(rel)) continue;
    if (entry.isDirectory()) {
      const subFiles = await collectFiles(fullPath, repoRoot, isIgnored);
      results.push(...subFiles);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

const addRepo = async (argv: ArgumentsCamelCase<AddArgs>) => {
  await checkLoggedIn();
  if (!(await checkRepoInitialized())) return;

  const repoRoot = process.cwd();
  const isIgnored = await loadIgnoreMatcher(repoRoot);

  const inputPath = argv.files === "." ? repoRoot : argv.files;
  const sourcePath = path.resolve(repoRoot, inputPath);
  const relativePath = path.relative(repoRoot, sourcePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    console.error("Error: Path is outside the repository.");
    return;
  }

  try {
    let index = await getIndex();
    const head = await getHead();

    if (Object.keys(index).length === 0 && head !== null) {
      const headCommit = await readCommit(head);
      index = { ...headCommit.tree };
    }

    let stats;
    try {
      stats = await fs.stat(sourcePath);
    } catch (err: any) {
      if (err.code === "ENOENT") {
        console.error(`fatal: pathspec '${argv.files}' did not match any files`);
        return;
      }
      throw err;
    }

    if (stats.isFile()) {
      const posixRel = toPosixPath(relativePath);
      if (isIgnored(posixRel)) {
        return;
      }

      const buffer = await fs.readFile(sourcePath);
      const hash = await writeBlob(buffer);
      index[posixRel] = hash;

      await saveIndex(index);
      console.log(`file ${posixRel} added to the staging area`);
    } else if (stats.isDirectory()) {
      const files = await collectFiles(sourcePath, repoRoot, isIgnored);
      for (const file of files) {
        const rel = path.relative(repoRoot, file);
        const posixRel = toPosixPath(rel);
        const buffer = await fs.readFile(file);
        const hash = await writeBlob(buffer);
        index[posixRel] = hash;
      }

      if (argv.files === ".") {
        for (const trackedFile of Object.keys(index)) {
          const fullPath = path.join(repoRoot, trackedFile);
          try {
            const s = await fs.stat(fullPath);
            if (!s.isFile()) {
              delete index[trackedFile];
            }
          } catch {
            delete index[trackedFile];
          }
        }
      }

      await saveIndex(index);
      const displayPath =
        relativePath === "" || relativePath === "." ? "." : toPosixPath(relativePath);
      console.log(`directory ${displayPath} added to the staging area`);
    } else {
      console.log(`${relativePath} is neither a file nor a directory`);
    }
  } catch (err) {
    console.error("error adding item:", err);
  }
};

export { addRepo };
