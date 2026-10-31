import { promises as fs } from "fs";
import path from "path";
import { checkLoggedIn } from "./checkloggedin.js";
import {
  getCommitsDir,
  getObjectsDir,
  getSnapkeepDir,
  saveIndex,
} from "../utils/cas.js";

const initRepo = async () => {
  await checkLoggedIn();
  const repoPath = getSnapkeepDir();
  const objectsPath = getObjectsDir();
  const commitsPath = getCommitsDir();
  const repoName = path.basename(process.cwd());

  try {
    await fs.mkdir(repoPath, { recursive: true });
    await fs.mkdir(objectsPath, { recursive: true });
    await fs.mkdir(commitsPath, { recursive: true });

    // Create .snapkeep/HEAD as an empty file ("")
    await fs.writeFile(path.join(repoPath, "HEAD"), "", "utf-8");

    // Create .snapkeep/index.json containing {}
    await saveIndex({});

    const configData = {
      name: repoName,
    };
    await fs.writeFile(
      path.join(repoPath, "config.json"),
      JSON.stringify(configData, null, 2),
      "utf-8"
    );
    console.log("repo initialized");
  } catch (err) {
    console.error("error initializing the repository", err);
  }
};

export { initRepo };
