import path from 'path';
import fs from "fs";
import {promisify} from 'util';

const readdir = promisify(fs.readdir);
const copyFile = promisify(fs.copyFile);


const revert = async(commitID:string)=>{
      const repoPath = path.resolve(process.cwd(),'.myGit');
    const commitsPath = path.join(repoPath,'commits');

    
     try{
          const commitDir = path.join(commitsPath,commitID);
          const files = await readdir(commitDir);
          const parentDir = path.resolve(repoPath,'..');

          for(const file of files){
            await copyFile(path.join(commitDir,file),path.join(parentDir,file));
          }

          console.log(`commit with commitId: ${commitID} reverted`);
     }catch(err){
        console.error("Unable to revert commit: ",err);
     }
}

export {revert};