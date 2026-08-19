import { promises as fs } from "fs";
import path from 'path';
import axios from 'axios';
import JSZip from 'jszip';
import { readGlobalConfig } from "../utils/globalConfig.js";
import { checkRepoInitialized } from "./checkrepoinitialized.js";

const SERVER_URL = "http://localhost:3000/pull"; 



const enforcePull = async(commitID:string,username : string,loadedZip:any)=>{

      const repoPath = path.resolve(process.cwd(),'.snapkeep');
     const commitsPath = path.join(repoPath,`${username}`);


     try {
            let commonSegment = "";

      for (const relativePath of Object.keys(loadedZip.files)) {
        const parts = relativePath.split('/');
        
        // Ensure the path has at least 2 segments (index 0 and index 1)
        if (parts.length >= 2) {
          const secondPart = parts[1];
          if (secondPart) {
            commonSegment = secondPart;
            break; // Stop looping immediately since we found it
          }
        }
      }
      const revertPath = path.join(commitsPath,`${commonSegment}`)
      const commitDir = path.join(revertPath, commitID);
      const parentDir = path.resolve(repoPath, "..");

      await fs.cp(commitDir, parentDir, {
          recursive: true,
          force: true,
          filter: (src:any) =>
              path.basename(src) !== "commit.json"
      });

  }catch(err){
        console.error("Unable to pull changes: ",err);
     }
}

/// read all the commit ids.
const getCommitIds = (loadedZip:any) => {
  const commitIds = new Set();

  for (const relativePath of Object.keys(loadedZip.files)) {
    const parts = relativePath.split('/');
    
    // Ensure the path has at least a username and a commitId segment
    if (parts.length >= 3) {
      const commitId = parts[2];
      if (commitId) {
        commitIds.add(commitId);
      }
    }
  }

  return Array.from(commitIds);
};

const pullRepo = async () => {
  const repoPath = path.resolve(process.cwd(), '.snapkeep');

  const config = await readGlobalConfig();
  if (!config) {
    console.error("User not logged in. Please login first.");
    return;
  }
  const repoConfig = await checkRepoInitialized();
  if (!repoConfig) return;

  const username = config.username;
  const reponame = repoConfig.name;

  try {
    console.log("Connecting to server to pull repository...");
    // 2. Request the zipped commits from your server as an arraybuffer
    const response = await axios({
      params: { username:username,
        reponame:reponame
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
      const absolutePath = path.join(repoPath, relativePath);

      if (file.dir) {
        // If it's a directory structure, recreate it locally
        await fs.mkdir(absolutePath, { recursive: true });
      } else {
        // Ensure the parent directory for the file exists before writing
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        
        // Get the file content as a Node.js Buffer and write it
        const contentBuffer = await file.async('nodebuffer');
        await fs.writeFile(absolutePath, contentBuffer);
      }
    }

    const commits = getCommitIds(loadedZip);
    for(const commitid of commits){
      if (typeof commitid !== "string") {
      throw new Error(`Invalid commit id: ${String(commitid)}`);
     }
     await enforcePull(commitid,username,loadedZip);
    }

    console.log("All commits pulled and extracted successfully.");
  } catch (err: any) {
    console.error("Error pulling from server:", err.message || err);
  }
};

export { pullRepo };