import { promises as fs } from "fs";
import path from "path";
import type { ArgumentsCamelCase } from "yargs";
import { checkRepoInitialized } from "./checkrepoinitialized.js";


export const getLogs = async()=>{
    if (!(await checkRepoInitialized())) return;
    const repoPath = path.resolve(process.cwd(),".snapkeep");
    const commitsPath = path.join(repoPath,"commits");

    const commits = await fs.readdir(commitsPath);
    const logs = [];
    
    for(const commit of commits){
        const commitpath = path.join(commitsPath,commit);
        const commitjson = path.join(commitpath,"commit.json");

        const commitdata = await fs.readFile(commitjson,"utf-8");
        const commitdatajson = JSON.parse(commitdata);
       // const date = new Date(commitdatajson.date);
        logs.push({
            commitId:commit,
            message:commitdatajson.message,
            date:commitdatajson.date
        })
    }

    logs.sort(
        (a, b) =>
            new Date(b.date).getTime() -
            new Date(a.date).getTime()
    );

    for(const log of logs){
        const date = new Date(log.date);
        date.toLocaleDateString();
         console.log(`commitId: ${log.commitId}  message: ${log.message}   Date: ${date}`);
    }

}

