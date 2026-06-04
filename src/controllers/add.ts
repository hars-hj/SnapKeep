import { promises as fs } from "fs";
import path from 'path';
import type { ArgumentsCamelCase } from "yargs";

type AddArgs = { files: string };

const addRepo = async (argv: ArgumentsCamelCase<AddArgs>)=>{
    const filePath = argv.files;
   const repoPath = path.resolve(process.cwd(),".myGit");
   const stagingPath = path.join(repoPath,"staging");
 // console.log(filePath);
   try{
      await fs.mkdir(stagingPath,{recursive:true});
      const fileName:string = path.basename(filePath);
      await fs.copyFile(filePath,path.join(stagingPath,fileName));
      console.log(`file ${fileName} will be added to the staging area`);
    
   }catch(err){
    console.error("error adding file: ",err);
   }
}

export {addRepo};