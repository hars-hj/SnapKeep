import { promises as fs } from "fs";
import path from 'path';

const initRepo = async() =>{
    const repoPath = path.resolve(process.cwd(),".myGit");
    const commitsPath = path.join(repoPath,"commits");

    try{
       await fs.mkdir(repoPath,{recursive:true})
       await fs.mkdir(commitsPath ,{recursive:true})
       await fs.writeFile(
        path.join(repoPath,'config.json'),
        JSON.stringify({bucket:process.env.S3_BUCKET})
       )
       console.log("repo initialized");
    }catch(err){ 
      console.error("error insializing the reposetory", err);
    }
}

export {initRepo};