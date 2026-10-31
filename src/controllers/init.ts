import { promises as fs } from "fs";
import path from "path";
import { checkLoggedIn } from "./checkloggedin.js";
import {
  getCommitsDir,
  getObjectsDir,
  getSnapkeepDir,
  saveIndex,
} from "../utils/cas.js";

const DEFAULT_IGNORE_CONTENT = `# SnapKeep ignore rules
.snapkeep
.snapkeepignore
.git
node_modules
dist
.env
.DS_Store
*.log
`;

async function ensureSnapkeepIgnore(cwd: string): Promise<void> {
  const ignorePath = path.join(cwd, ".snapkeepignore");
  try {
    await fs.access(ignorePath);
  } catch {
    await fs.writeFile(ignorePath, DEFAULT_IGNORE_CONTENT, "utf-8");
  }
}

const initRepo = async () => {
  await checkLoggedIn();
  const repoPath = getSnapkeepDir();
  const objectsPath = getObjectsDir();
  const commitsPath = getCommitsDir();
  const configPath = path.join(repoPath, "config.json");
  const headPath = path.join(repoPath, "HEAD");
  const repoName = path.basename(process.cwd());

  try {
    let isExisting = false;
    try {
      await fs.access(configPath);
      isExisting = true;
    } catch {
      try {
        await fs.access(headPath);
        isExisting = true;
      } catch {
        isExisting = false;
      }
    }

    if (isExisting) {
      await fs.mkdir(objectsPath, { recursive: true });
      await fs.mkdir(commitsPath, { recursive: true });
      await ensureSnapkeepIgnore(process.cwd());
      console.log(
        `Reinitialized existing SnapKeep repository in ${path.join(
          process.cwd(),
          ".snapkeep"
        )}`
      );
      return;
    }

    await fs.mkdir(repoPath, { recursive: true });
    await fs.mkdir(objectsPath, { recursive: true });
    await fs.mkdir(commitsPath, { recursive: true });

    // Create .snapkeep/HEAD as an empty file ("")
    await fs.writeFile(headPath, "", "utf-8");

    // Create .snapkeep/index.json containing {}
    await saveIndex({});

    const configData = {
      name: repoName,
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(configData, null, 2),
      "utf-8"
    );

    await ensureSnapkeepIgnore(process.cwd());
    console.log("repo initialized");
  } catch (err) {
    console.error("error initializing the repository", err);
  }
};

export { initRepo };
