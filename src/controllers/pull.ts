import { promises as fs } from "fs";
import path from 'path';
import { S3, S3_BUCKET } from '../config/AwsConfig.js';

// Pulls all commits from S3 and recreates them locally
const pullRepo = async () => {

  const repoPath = path.resolve(process.cwd(), '.myGit');
  
 
  const commitspath = path.join(repoPath, "commits");

  try {
    // List all objects in S3 under the "commits/" prefix
    const data = await S3.listObjectsV2({
      Bucket: S3_BUCKET,
      Prefix: 'commits/'
    }).promise();

    // All files returned from S3
    const objects: any = data.Contents;


    for (const object of objects) {
      
      // Full S3 key (e.g. commits/abc123/file.txt)
      const key = object.Key;

      // Directory part of the key
      const fulladd = path.dirname(key);

      // Extract commit id from path
      const last = fulladd.split("/").pop();
      if (!last) continue;

      const commitDir = path.join(commitspath, last);

      // Create commit directory if it doesn't exist
      await fs.mkdir(commitDir, { recursive: true });

      // Params to fetch the file from S3
      const params = {
        Bucket: S3_BUCKET,
        Key: key
      };

      // Download file content from S3
      const fileContent = await S3.getObject(params).promise();
      const body = fileContent.Body!.toString();

      // Write file to local repo path
      await fs.writeFile(path.join(repoPath, key), body);
    }

    // Success message after all files are pulled
    console.log("All commits pulled successfully.");
  } catch (err) {
    console.error("Error pulling from S3 bucket: ", err);
  }
};

export { pullRepo };
