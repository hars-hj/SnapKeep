import { promises as fs } from "fs";
import path from 'path';
import { checkLoggedIn } from "./checkloggedin.js";
const initRepo = async() =>{
  checkLoggedIn();
    const repoPath = path.resolve(process.cwd(),".myGit");
    const commitsPath = path.join(repoPath,"commits");
    const repoName = path.basename(process.cwd());

    try{
       await fs.mkdir(repoPath,{recursive:true})
       await fs.mkdir(commitsPath ,{recursive:true})
       const configData = {
        name: repoName,
        
      };
       await fs.writeFile(
        path.join(repoPath,'config.json'),
        JSON.stringify(configData, null, 2),
      'utf-8'
       )
       console.log("repo initialized");
    }catch(err){ 
      console.error("error insializing the reposetory", err);
    }
}

export {initRepo};