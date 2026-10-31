import type { ArgumentsCamelCase } from "yargs";
import { checkLoggedIn } from "./checkloggedin.js";
import { checkRepoInitialized } from "./checkrepoinitialized.js";
import {
  CommitObject,
  getHead,
  getIndex,
  readCommit,
  serializeCommit,
  setHead,
  writeCommit,
} from "../utils/cas.js";

type AddArgs = {
  message: string;
};

const commitRepo = async (argv: ArgumentsCamelCase<AddArgs>) => {
  await checkLoggedIn();
  if (!(await checkRepoInitialized())) return;

  const index = await getIndex();
  if (Object.keys(index).length === 0) {
    console.error("Nothing to commit. Stage files with 'snapkeep add' first.");
    return;
  }

  const parent = await getHead();

  if (parent !== null) {
    const parentCommit = await readCommit(parent);
    const indexCanonical = serializeCommit({
      tree: index,
      parent: null,
      message: "",
      date: "",
    });
    const parentCanonical = serializeCommit({
      tree: parentCommit.tree,
      parent: null,
      message: "",
      date: "",
    });

    if (indexCanonical === parentCanonical) {
      console.log("Nothing to commit, working tree clean");
      return;
    }
  }

  const message = argv.message;

  try {
    const commitObj: CommitObject = {
      tree: index,
      parent,
      message,
      date: new Date().toISOString(),
    };

    const commitHash = await writeCommit(commitObj);
    await setHead(commitHash);

    console.log(`commit ${commitHash} created with message "${message}"`);
  } catch (err) {
    console.error("error committing files:", err);
  }
};

export { commitRepo };
