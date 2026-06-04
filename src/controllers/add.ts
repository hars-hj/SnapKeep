import { promises as fs } from "fs";
import path from "path";
import type { ArgumentsCamelCase } from "yargs";

type AddArgs = {
    files: string;
};

const addRepo = async (argv: ArgumentsCamelCase<AddArgs>) => {
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
                recursive: true
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