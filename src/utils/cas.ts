import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

export interface CommitObject {
  tree: Record<string, string>; // POSIX-normalized relative path (e.g., "src/index.ts") -> 64-char hex blob SHA-256
  parent: string | null;        // 64-char hex commit SHA-256 of parent commit, or null for initial commit
  message: string;
  date: string;                 // ISO timestamp
}

// ---------------------------------------------------------------------------
// Path Helpers (relative to process.cwd())
// ---------------------------------------------------------------------------

export function getSnapkeepDir(): string {
  return path.join(process.cwd(), ".snapkeep");
}

export function getObjectsDir(): string {
  return path.join(getSnapkeepDir(), "objects");
}

export function getCommitsDir(): string {
  return path.join(getSnapkeepDir(), "commits");
}

export function getBlobPath(hash: string): string {
  return path.join(getObjectsDir(), hash.slice(0, 2), hash.slice(2));
}

export function getCommitPath(hash: string): string {
  return path.join(getCommitsDir(), `${hash}.json`);
}

export function toPosixPath(relPath: string): string {
  return relPath.replace(/\\/g, "/");
}

// ---------------------------------------------------------------------------
// Blob Storage (.snapkeep/objects/ab/cdef...)
// ---------------------------------------------------------------------------

export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex").toLowerCase();
}

export async function writeBlob(buffer: Buffer): Promise<string> {
  const hash = hashBuffer(buffer);
  if (!(await hasBlob(hash))) {
    const blobPath = getBlobPath(hash);
    await fs.mkdir(path.dirname(blobPath), { recursive: true });
    await fs.writeFile(blobPath, buffer);
  }
  return hash;
}

export async function readBlob(hash: string): Promise<Buffer> {
  const blobPath = getBlobPath(hash);
  const buffer = await fs.readFile(blobPath);
  const actualHash = hashBuffer(buffer);
  if (actualHash !== hash.toLowerCase()) {
    throw new Error(
      `Blob integrity check failed for ${hash}: computed hash was ${actualHash}`
    );
  }
  return buffer;
}

export async function hasBlob(hash: string): Promise<boolean> {
  try {
    await fs.access(getBlobPath(hash));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Deterministic Commit Serialization & Storage (.snapkeep/commits/<hash>.json)
// ---------------------------------------------------------------------------

export function serializeCommit(commit: CommitObject): string {
  const sortedTree: Record<string, string> = {};
  for (const key of Object.keys(commit.tree).sort()) {
    sortedTree[key] = commit.tree[key];
  }

  const canonical = {
    tree: sortedTree,
    parent: commit.parent,
    message: commit.message,
    date: commit.date,
  };

  return JSON.stringify(canonical, null, 2);
}

export function hashCommit(commit: CommitObject): string {
  return crypto
    .createHash("sha256")
    .update(Buffer.from(serializeCommit(commit), "utf-8"))
    .digest("hex")
    .toLowerCase();
}

export async function writeCommit(commit: CommitObject): Promise<string> {
  const hash = hashCommit(commit);
  const commitPath = getCommitPath(hash);
  await fs.mkdir(path.dirname(commitPath), { recursive: true });
  await fs.writeFile(commitPath, serializeCommit(commit), "utf-8");
  return hash;
}

export async function readCommit(hash: string): Promise<CommitObject> {
  const commitPath = getCommitPath(hash);
  const content = await fs.readFile(commitPath, "utf-8");
  const parsed = JSON.parse(content) as CommitObject;
  const actualHash = hashCommit(parsed);
  if (actualHash !== hash.toLowerCase()) {
    throw new Error(
      `Commit integrity check failed for ${hash}: computed hash was ${actualHash}`
    );
  }
  return parsed;
}

export async function hasCommit(hash: string): Promise<boolean> {
  try {
    await fs.access(getCommitPath(hash));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// HEAD & Index Management (.snapkeep/HEAD and .snapkeep/index.json)
// ---------------------------------------------------------------------------

export async function getHead(): Promise<string | null> {
  try {
    const headPath = path.join(getSnapkeepDir(), "HEAD");
    const content = await fs.readFile(headPath, "utf-8");
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export async function setHead(commitHash: string): Promise<void> {
  const headPath = path.join(getSnapkeepDir(), "HEAD");
  await fs.mkdir(path.dirname(headPath), { recursive: true });
  await fs.writeFile(headPath, `${commitHash.trim()}\n`, "utf-8");
}

export async function getIndex(): Promise<Record<string, string>> {
  try {
    const indexPath = path.join(getSnapkeepDir(), "index.json");
    const content = await fs.readFile(indexPath, "utf-8");
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveIndex(index: Record<string, string>): Promise<void> {
  const sortedIndex: Record<string, string> = {};
  for (const key of Object.keys(index).sort()) {
    sortedIndex[key] = index[key];
  }
  const indexPath = path.join(getSnapkeepDir(), "index.json");
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(sortedIndex, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Repository Object Enumeration (for sync negotiation)
// ---------------------------------------------------------------------------

export async function listLocalCommits(): Promise<string[]> {
  const head = await getHead();
  if (!head) {
    return [];
  }

  const commits: string[] = [];
  const visited = new Set<string>();
  let currentHash: string | null = head;

  while (currentHash) {
    if (visited.has(currentHash)) {
      break;
    }
    visited.add(currentHash);
    commits.push(currentHash);

    const commit = await readCommit(currentHash);
    currentHash = commit.parent;
  }

  return commits;
}

export async function listLocalBlobs(): Promise<string[]> {
  const objectsDir = getObjectsDir();
  let prefixEntries;
  try {
    prefixEntries = await fs.readdir(objectsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const blobs: string[] = [];
  for (const prefixEntry of prefixEntries) {
    if (!prefixEntry.isDirectory()) continue;
    const prefix = prefixEntry.name;
    if (prefix.length !== 2) continue;

    const subDir = path.join(objectsDir, prefix);
    let fileEntries;
    try {
      fileEntries = await fs.readdir(subDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const fileEntry of fileEntries) {
      if (!fileEntry.isFile()) continue;
      const suffix = fileEntry.name;
      if (prefix.length + suffix.length === 64) {
        blobs.push(`${prefix}${suffix}`);
      }
    }
  }

  return blobs.sort();
}

