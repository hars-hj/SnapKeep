import { checkRepoInitialized } from "./checkrepoinitialized.js";
import { getHead, readCommit } from "../utils/cas.js";

export const getLogs = async () => {
  if (!(await checkRepoInitialized())) return;

  let curr = await getHead();
  if (!curr) {
    console.log("No commits yet.");
    return;
  }

  const visited = new Set<string>();

  while (curr !== null) {
    if (visited.has(curr)) {
      break;
    }
    visited.add(curr);

    const commit = await readCommit(curr);
    console.log(`Commit: ${curr}`);
    console.log(`Parent: ${commit.parent ?? "None"}`);
    console.log(`Date: ${commit.date}`);
    console.log(`Message: ${commit.message}\n`);

    curr = commit.parent;
  }
};
