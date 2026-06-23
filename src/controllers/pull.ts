import { promises as fs } from "fs";
import path from 'path';
import axios from 'axios';
import JSZip from 'jszip';

// URL of your central server (Adjust this to match your backend port/route)
const SERVER_URL = "http://localhost:3000/pull"; 

const pullRepo = async () => {
  const repoPath = path.resolve(process.cwd(), '.myGit');

  try {
    console.log("Connecting to server to pull repository...");

    // 1. Ensure the .myGit directory exists locally
    await fs.mkdir(repoPath, { recursive: true });

    // 2. Request the zipped commits from your server as an arraybuffer
    const response = await axios({
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

    console.log("All commits pulled and extracted successfully.");
  } catch (err: any) {
    console.error("Error pulling from server:", err.message || err);
  }
};

export { pullRepo };