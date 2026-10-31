import { promises as fs } from "fs";
import path from 'path';
import axios from 'axios';
import JSZip from 'jszip';
import { checkLoggedIn } from "./checkloggedin.js";
import { checkRepoInitialized } from "./checkrepoinitialized.js";

const SERVER_URL = "http://localhost:3000/pull"; 



const enforcePull = async (
  commitID: string,
  username: string,
  reponame: string
) => {
  const repoPath = path.resolve(process.cwd(), ".snapkeep");
  const commitDir = path.join(repoPath, username, reponame, commitID);
  const parentDir = path.resolve(repoPath, "..");

  try {
    await fs.cp(commitDir, parentDir, {
      recursive: true,
      force: true,
      filter: (src) => path.basename(src) !== "commit.json",
    });
  } catch (err) {
    console.error("Unable to pull changes: ", err);
  }
};

async function getLatestCommitId(
  username: string,
  reponame: string
): Promise<string | null> {
  const commitsDir = path.join(process.cwd(), ".snapkeep", username, reponame);

  let entries;
  try {
    entries = await fs.readdir(commitsDir, { withFileTypes: true });
  } catch {
    return null;
  }

  let latestId: string | null = null;
  let latestTime = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    try {
      const raw = await fs.readFile(
        path.join(commitsDir, entry.name, "commit.json"),
        "utf-8"
      );
      const { date } = JSON.parse(raw);
      const time = new Date(date).getTime();

      if (time > latestTime) {
        latestTime = time;
        latestId = entry.name;
      }
    } catch {
      // skip commits without valid commit.json
    }
  }

  return latestId;
}

const pullRepo = async () => {
  const repoPath = path.resolve(process.cwd(), '.snapkeep');

  const config = await checkLoggedIn();
  const repoConfig = await checkRepoInitialized();
  if (!repoConfig) return;

  const username = config.username;
  const reponame = repoConfig.name;

  try {
    console.log("Connecting to server to pull repository...");
    // 2. Request the zipped commits from your server as an arraybuffer
    const response = await axios({
      params: { 
        username: username,
        reponame: reponame,
      }, 
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
      method: 'get',
      url: SERVER_URL,
      responseType: 'arraybuffer', 
    });

    console.log("Download complete. Extracting repository data...");

    // 3. Load the zip file data into JSZip
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(response.data);

    // 4. Iterate over every file and folder inside the zip file
    for (const [relativePath, file] of Object.entries(loadedZip.files)) {
      // Handle both paths relative to repo root (commitId/...) and legacy full S3 keys (username/reponame/commitId/...)
      const prefix = `${username}/${reponame}/`;
      const cleanRelPath = relativePath.startsWith(prefix)
        ? relativePath.slice(prefix.length)
        : relativePath;

      const mirrorPath = path.join(repoPath, username, reponame, cleanRelPath);
      const commitsPath = path.join(repoPath, "commits", cleanRelPath);

      if (file.dir) {
        // If it's a directory structure, recreate it locally
        await fs.mkdir(mirrorPath, { recursive: true });
        await fs.mkdir(commitsPath, { recursive: true });
      } else {
        // Ensure the parent directory for the file exists before writing
        await fs.mkdir(path.dirname(mirrorPath), { recursive: true });
        await fs.mkdir(path.dirname(commitsPath), { recursive: true });
        
        // Get the file content as a Node.js Buffer and write it
        const contentBuffer = await file.async('nodebuffer');
        await fs.writeFile(mirrorPath, contentBuffer);
        await fs.writeFile(commitsPath, contentBuffer);
      }
    }

    const latestCommitId = await getLatestCommitId(username, reponame);
    if (latestCommitId) {
      await enforcePull(latestCommitId, username, reponame);
    }

    console.log("All commits pulled and extracted successfully.");
  } catch (err: any) {
    console.error("Error pulling from server:", err.message || err);
  }
};

export { pullRepo };