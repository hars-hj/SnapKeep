import { checkRepoInitialized } from "./checkrepoinitialized.js";
import { getHead } from "../utils/cas.js";
import { getRepoStatus } from "../utils/workspace.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

export const statusRepo = async () => {
  if (!(await checkRepoInitialized())) return;

  const head = await getHead();
  console.log(`HEAD: ${head ?? "No commits yet"}\n`);

  const status = await getRepoStatus();

  if (status.isClean && status.untracked.length === 0) {
    console.log("working tree clean");
    return;
  }

  // Changes to be committed
  const hasStaged =
    status.staged.added.length > 0 ||
    status.staged.modified.length > 0 ||
    status.staged.deleted.length > 0;

  if (hasStaged) {
    console.log("Changes to be committed:");
    for (const f of status.staged.added) {
      console.log(`  ${GREEN}new file:   ${f}${RESET}`);
    }
    for (const f of status.staged.modified) {
      console.log(`  ${GREEN}modified:   ${f}${RESET}`);
    }
    for (const f of status.staged.deleted) {
      console.log(`  ${GREEN}deleted:    ${f}${RESET}`);
    }
    console.log();
  }

  // Changes not staged for commit
  const hasUnstaged =
    status.unstaged.modified.length > 0 || status.unstaged.deleted.length > 0;

  if (hasUnstaged) {
    console.log("Changes not staged for commit:");
    for (const f of status.unstaged.modified) {
      console.log(`  ${RED}modified:   ${f}${RESET}`);
    }
    for (const f of status.unstaged.deleted) {
      console.log(`  ${RED}deleted:    ${f}${RESET}`);
    }
    console.log();
  }

  // Untracked files
  if (status.untracked.length > 0) {
    console.log("Untracked files:");
    for (const f of status.untracked) {
      console.log(`  ${YELLOW}${f}${RESET}`);
    }
    console.log();
  }
};

