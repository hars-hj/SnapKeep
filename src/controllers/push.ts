import { promises as fs } from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";
import JSZip from "jszip"; 
import {readGlobalConfig} from "../utils/globalConfig.js";
import {readRepoConfig} from "../utils/readConfig.json.js"
 


async function collectFiles(
  dir: string,
  baseDir: string
): Promise<{ filePath: string; fullPath: string }[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: { filePath: string; fullPath: string }[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      const nested = await collectFiles(fullPath, baseDir);
      files.push(...nested);
    } else {
      files.push({ filePath: relativePath, fullPath });
    }
  }

  return files;
}

const pushRepo = async () => {
  const repoPath = path.resolve(process.cwd(), ".myGit");
  const commitsPath = path.join(repoPath, "commits");

  const config = await readGlobalConfig();
  if (!config) {
    console.error("User not logged in. Please login first.");
    return;
  }
   const username = config.username;
  
  const server_url = config.serverUrl ||  "http://localhost:3000";
  
  try {
    const pushedPath = path.join(repoPath, "pushed.json");
    let pushedCommits: string[] = [];
    try {
      const raw = await fs.readFile(pushedPath, "utf-8");
      pushedCommits = JSON.parse(raw);
    } catch {
      pushedCommits = [];
    }

    // This dynamically reads all your folder names as commit IDs
    const commitDirs = await fs.readdir(commitsPath);

    for (const commitDir of commitDirs) {
      if (pushedCommits.includes(commitDir)) continue;

      const commitPath = path.join(commitsPath, commitDir);
      const files = await collectFiles(commitPath, commitPath);
      const zip = new JSZip();

      for (const { filePath, fullPath } of files) {
        const content = await fs.readFile(fullPath);
        const normalizedPath = filePath.replace(/\\/g, "/");
        zip.file(normalizedPath, content);
      }

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
      const repoConfig = await readRepoConfig();
      const reponame = repoConfig?.name;
      const form = new FormData();
      form.append("username", username);
      form.append("reponame",reponame)
      form.append("commitId", commitDir); // The folder name acts as the ID

      form.append("file", zipBuffer, {
        filename: `${commitDir}.zip`,
        contentType: "application/zip",
      });

      await axios.post(`${server_url}/push`, form, {
        headers: form.getHeaders(),
      });

      console.log(`pushed commit zip: ${commitDir}`);

      pushedCommits.push(commitDir);
      await fs.writeFile(pushedPath, JSON.stringify(pushedCommits, null, 2));
    }

    console.log("all commits pushed to server");
  } catch (err) {
    console.error("Error pushing to server: ", err);
  }
};

export { pushRepo };