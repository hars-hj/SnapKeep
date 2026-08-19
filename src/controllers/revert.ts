import path from 'path';
import { promises as fs } from "fs";
import {promisify} from 'util';
import { checkLoggedIn } from './checkloggedin.js';
import { checkRepoInitialized } from "./checkrepoinitialized.js";
const readdir = promisify(fs.readdir);
const copyFile = promisify(fs.copyFile);


const revert = async(commitID:string)=>{
    checkLoggedIn();
    if (!(await checkRepoInitialized())) return;
      const repoPath = path.resolve(process.cwd(),'.snapkeep');
     const commitsPath = path.join(repoPath,'commits');

    
     try {
      const commitDir = path.join(commitsPath, commitID);
      const parentDir = path.resolve(repoPath, "..");

      await fs.cp(commitDir, parentDir, {
          recursive: true,
          force: true,
          filter: (src:any) =>
              path.basename(src) !== "commit.json"
      });

      console.log(
          `commit with commitId: ${commitID} reverted`
      );
  }catch(err){
        console.error("Unable to revert commit: ",err);
     }
}

export {revert};