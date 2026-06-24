import { promises as fs } from "fs";
import path from "path";
import type { ArgumentsCamelCase } from "yargs";
import { checkLoggedIn } from "./checkloggedin.js";
type AddArgs = {
    files: string;
};

const ignoredFiles = new Set<string>();
///f unction to avoid addding the files that are present in gitignore
const getMyGitIgnoreFiles = async()=>{
    const content = await fs.readFile(".mygitignore", "utf-8");
   ignoredFiles.clear();
   ignoredFiles.add(".myGit");
   ignoredFiles.add(".mygitignore");
    content
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .forEach(line => ignoredFiles.add(line));

}

const addRepo = async (argv: ArgumentsCamelCase<AddArgs>) => {
    checkLoggedIn();
    if(argv.files === "."){
        argv.files = process.cwd();
    } 
    await getMyGitIgnoreFiles();
    const sourcePath = path.resolve(argv.files);
   

   
    const repoPath = path.resolve(process.cwd(), ".myGit");
    const stagingPath = path.join(repoPath, "staging");

    try {
        await fs.mkdir(stagingPath, { recursive: true });

        const stats = await fs.stat(sourcePath);

        const name = path.basename(sourcePath);
        const destination = path.join(stagingPath, name);

        if (stats.isFile()) {
            await fs.copyFile(sourcePath, destination);

            console.log(
                `file ${name} added to the staging area`
            );
        } else if (stats.isDirectory()) {
            await fs.cp(sourcePath, destination, {
                recursive: true,
                filter: (src) => {         /// this filter is used to avoid adding the files that are present in the gitignore
                    const name = path.basename(src);

                     return !ignoredFiles.has(name);
                }
            });

            console.log(
                `directory ${name} added to the staging area`
            );
        } else {
            console.log(
                `${name} is neither a file nor a directory`
            );
        }
    } catch (err) {
        console.error("error adding item:", err);
    }
};

export { addRepo };