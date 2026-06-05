import { promises as fs } from "fs";
import path from 'path';
import {S3 , S3_BUCKET} from '../config/AwsConfig.js';

//function to upload directory to s3 bucket recursively
async function uploadDirectory(
    localDir: string,
    s3Prefix: string
) {
    const entries = await fs.readdir(localDir, {
        withFileTypes: true
    });

    for (const entry of entries) {
        const fullPath = path.join(localDir, entry.name);

        if (entry.isDirectory()) {
            await uploadDirectory(
                fullPath,
                `${s3Prefix}/${entry.name}`
            );
        } else {
            const fileContent = await fs.readFile(fullPath);

            await S3.upload({
                Bucket: S3_BUCKET,
                Key: `${s3Prefix}/${entry.name}`,
                Body: fileContent
            }).promise();
        }
    }
}

const pushRepo = async() =>{
    const repoPath = path.resolve(process.cwd(),'.myGit');
    const commitsPath = path.join(repoPath,'commits');

    try{
        const pushedPath = path.join(repoPath, "pushed.json");

        let pushedCommits: string[] = [];

        try {
            // list of all the already pushed commits
            const raw = await fs.readFile(pushedPath, "utf-8");
            pushedCommits = JSON.parse(raw);
        } catch {
            pushedCommits = [];
        }

        const commitDirs = await fs.readdir(commitsPath);

        for(const commitDir of commitDirs){

            // skip if alerady commited
            if (pushedCommits.includes(commitDir)) {
               
                    continue;
                } 

                const commitPath = path.join(commitsPath, commitDir);
              // upload the uncommited dirs
                await uploadDirectory(
                    commitPath,
                    `commits/${commitDir}`
                );
            
            // Mark as pushed
            pushedCommits.push(commitDir);

            await fs.writeFile(
                pushedPath,
                JSON.stringify(pushedCommits, null, 2)
            );
        }
        
        console.log('all commits pushed to s3');

    }catch(err){
        console.error("Error pushing in S3: ",err);
    }

}
export {pushRepo};