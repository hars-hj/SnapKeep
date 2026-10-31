import fs from "fs/promises";
import path from "path";
import {
  getHead,
  getIndex,
  hashBuffer,
  readBlob,
  readCommit,
  toPosixPath,
} from "./cas.js";

export interface RepoStatus {
  staged: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
  unstaged: {
    modified: string[];
    deleted: string[];
  };
  untracked: string[];
  vsHead: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
  isClean: boolean;
}

// ---------------------------------------------------------------------------
// 1. Ignore Rules
// ---------------------------------------------------------------------------

export async function loadIgnoreMatcher(
  cwd: string = process.cwd()
): Promise<(relPath: string) => boolean> {
  const defaultIgnores = new Set([
    ".snapkeep",
    ".snapkeepignore",
    ".git",
    "node_modules",
  ]);

  const rules: string[] = [];

  try {
    const content = await fs.readFile(path.join(cwd, ".snapkeepignore"), "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      // Strip trailing slashes
      const cleaned = line.replace(/[/\\]+$/, "");
      if (cleaned) {
        rules.push(cleaned);
      }
    }
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
  }

  return (relPath: string): boolean => {
    if (!relPath || relPath === ".") return false;
    const normalized = toPosixPath(relPath).replace(/^\.\//, "");
    const parts = normalized.split("/");

    // Default ignores always apply to any path segment
    if (parts.some((p) => defaultIgnores.has(p))) {
      return true;
    }

    for (const rule of rules) {
      if (rule.startsWith("*")) {
        const suffix = rule.slice(1);
        if (parts.some((p) => p.endsWith(suffix)) || normalized.endsWith(suffix)) {
          return true;
        }
      } else if (!rule.includes("/")) {
        if (parts.some((p) => p === rule)) {
          return true;
        }
      } else {
        const cleanRule = toPosixPath(rule).replace(/^\//, "");
        if (normalized === cleanRule || normalized.startsWith(cleanRule + "/")) {
          return true;
        }
      }
    }

    return false;
  };
}

// ---------------------------------------------------------------------------
// 2. Working Directory Hash Map
// ---------------------------------------------------------------------------

export async function scanWorkingTree(
  cwd: string = process.cwd()
): Promise<Record<string, string>> {
  const isIgnored = await loadIgnoreMatcher(cwd);
  const result: Record<string, string> = {};

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = toPosixPath(path.relative(cwd, fullPath));

      if (isIgnored(relPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        try {
          const buf = await fs.readFile(fullPath);
          result[relPath] = hashBuffer(buf);
        } catch {
          // ignore unreadable/locked files
        }
      }
    }
  }

  await walk(cwd);
  return result;
}

// ---------------------------------------------------------------------------
// 3. Repository Status Comparison
// ---------------------------------------------------------------------------

export async function getRepoStatus(
  cwd: string = process.cwd()
): Promise<RepoStatus> {
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
  const workTree = await scanWorkingTree(cwd);

  // Staged: comparing headTree vs indexTree
  const stagedAdded: string[] = [];
  const stagedModified: string[] = [];
  const stagedDeleted: string[] = [];

  for (const [p, hash] of Object.entries(indexTree)) {
    if (!(p in headTree)) {
      stagedAdded.push(p);
    } else if (headTree[p] !== hash) {
      stagedModified.push(p);
    }
  }
  for (const p of Object.keys(headTree)) {
    if (!(p in indexTree)) {
      stagedDeleted.push(p);
    }
  }

  // Unstaged: comparing trackedBase vs workTree
  // trackedBase is indexTree if non-empty, otherwise headTree
  const hasIndex = Object.keys(indexTree).length > 0;
  const trackedBase = hasIndex ? indexTree : headTree;

  const unstagedModified: string[] = [];
  const unstagedDeleted: string[] = [];

  for (const [p, hash] of Object.entries(trackedBase)) {
    if (p in workTree) {
      if (workTree[p] !== hash) {
        unstagedModified.push(p);
      }
    } else {
      unstagedDeleted.push(p);
    }
  }

  // Untracked: files in workTree not present in indexTree or headTree
  const untracked: string[] = [];
  for (const p of Object.keys(workTree)) {
    if (!(p in indexTree) && !(p in headTree)) {
      untracked.push(p);
    }
  }

  // vsHead: direct comparison of headTree vs workTree
  const vsHeadAdded: string[] = [];
  const vsHeadModified: string[] = [];
  const vsHeadDeleted: string[] = [];

  for (const [p, hash] of Object.entries(workTree)) {
    if (!(p in headTree)) {
      vsHeadAdded.push(p);
    } else if (headTree[p] !== hash) {
      vsHeadModified.push(p);
    }
  }
  for (const p of Object.keys(headTree)) {
    if (!(p in workTree)) {
      vsHeadDeleted.push(p);
    }
  }

  const isClean =
    stagedAdded.length === 0 &&
    stagedModified.length === 0 &&
    stagedDeleted.length === 0 &&
    unstagedModified.length === 0 &&
    unstagedDeleted.length === 0 &&
    vsHeadAdded.length === 0 &&
    vsHeadModified.length === 0 &&
    vsHeadDeleted.length === 0;

  return {
    staged: {
      added: stagedAdded.sort(),
      modified: stagedModified.sort(),
      deleted: stagedDeleted.sort(),
    },
    unstaged: {
      modified: unstagedModified.sort(),
      deleted: unstagedDeleted.sort(),
    },
    untracked: untracked.sort(),
    vsHead: {
      added: vsHeadAdded.sort(),
      modified: vsHeadModified.sort(),
      deleted: vsHeadDeleted.sort(),
    },
    isClean,
  };
}

// ---------------------------------------------------------------------------
// 4. Line Diff Helper
// ---------------------------------------------------------------------------

function isBinary(buf: Buffer): boolean {
  const checkLen = Math.min(buf.length, 8000);
  for (let i = 0; i < checkLen; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

function splitLines(buf: Buffer | null): string[] {
  if (!buf || buf.length === 0) return [];
  const str = buf.toString("utf-8");
  const lines = str.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

interface DiffLine {
  type: "equal" | "delete" | "insert";
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

function computeLCSDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;

  // dp table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const diff: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({
        type: "equal",
        text: oldLines[i - 1],
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({
        type: "insert",
        text: newLines[j - 1],
        newLineNumber: j,
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diff.unshift({
        type: "delete",
        text: oldLines[i - 1],
        oldLineNumber: i,
      });
      i--;
    }
  }

  return diff;
}

export function computeUnifiedDiff(
  relPath: string,
  oldBuf: Buffer | null,
  newBuf: Buffer | null
): string {
  if (oldBuf && isBinary(oldBuf)) {
    return `Binary files a/${relPath} and b/${relPath} differ\n`;
  }
  if (newBuf && isBinary(newBuf)) {
    return `Binary files a/${relPath} and b/${relPath} differ\n`;
  }

  const oldLines = splitLines(oldBuf);
  const newLines = splitLines(newBuf);

  const diffLines = computeLCSDiff(oldLines, newLines);

  // Check if any change exists
  const hasChanges = diffLines.some((d) => d.type !== "equal");
  if (!hasChanges) {
    return "";
  }

  // Find hunks with 3 lines of context
  const CONTEXT = 3;
  const hunks: { start: number; end: number }[] = [];

  for (let idx = 0; idx < diffLines.length; idx++) {
    if (diffLines[idx].type !== "equal") {
      const hunkStart = Math.max(0, idx - CONTEXT);
      const hunkEnd = Math.min(diffLines.length - 1, idx + CONTEXT);

      if (hunks.length > 0 && hunkStart <= hunks[hunks.length - 1].end + 1) {
        hunks[hunks.length - 1].end = Math.max(hunks[hunks.length - 1].end, hunkEnd);
      } else {
        hunks.push({ start: hunkStart, end: hunkEnd });
      }
    }
  }

  const output: string[] = [];
  output.push(`--- a/${relPath}`);
  output.push(`+++ b/${relPath}`);

  const RED = "\x1b[31m";
  const GREEN = "\x1b[32m";
  const CYAN = "\x1b[36m";
  const RESET = "\x1b[0m";

  for (const hunk of hunks) {
    const hunkSlice = diffLines.slice(hunk.start, hunk.end + 1);

    // Compute old and new line numbers and counts
    let oldStart = 0;
    let newStart = 0;
    let oldLineCount = 0;
    let newLineCount = 0;

    for (const line of hunkSlice) {
      if (line.type === "equal") {
        if (!oldStart && line.oldLineNumber) oldStart = line.oldLineNumber;
        if (!newStart && line.newLineNumber) newStart = line.newLineNumber;
        oldLineCount++;
        newLineCount++;
      } else if (line.type === "delete") {
        if (!oldStart && line.oldLineNumber) oldStart = line.oldLineNumber;
        oldLineCount++;
      } else if (line.type === "insert") {
        if (!newStart && line.newLineNumber) newStart = line.newLineNumber;
        newLineCount++;
      }
    }

    if (!oldStart) oldStart = 1;
    if (!newStart) newStart = 1;

    output.push(
      `${CYAN}@@ -${oldStart},${oldLineCount} +${newStart},${newLineCount} @@${RESET}`
    );

    for (const line of hunkSlice) {
      if (line.type === "equal") {
        output.push(` ${line.text}`);
      } else if (line.type === "delete") {
        output.push(`${RED}-${line.text}${RESET}`);
      } else if (line.type === "insert") {
        output.push(`${GREEN}+${line.text}${RESET}`);
      }
    }
  }

  return output.join("\n") + "\n";
}

