import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { ArgumentsCamelCase } from "yargs";
import { checkLoggedIn } from "./checkloggedin.js";
import { checkRepoInitialized } from "./checkrepoinitialized.js";
type AddArgs = {
    message: string;
};

async function hasStagedFiles(dir: string): Promise<boolean> {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
        if (err.code === "ENOENT") return false;
        throw err;
    }

    for (const entry of entries) {
        if (entry.isFile()) return true;
        if (
            entry.isDirectory() &&
            (await hasStagedFiles(path.join(dir, entry.name)))
        ) {
            return true;
        }
    }

    return false;
}

const commitRepo = async (argv: ArgumentsCamelCase<AddArgs>) => {
    await checkLoggedIn();
    if (!(await checkRepoInitialized())) return;
    const message = argv.message;

    const repoPath = path.resolve(process.cwd(), ".snapkeep");
    const stagedPath = path.join(repoPath, "staging");
    const commitPath = path.join(repoPath, "commits");

    if (!(await hasStagedFiles(stagedPath))) {
        console.error(
            "Nothing to commit. Stage files with 'snapkeep add' first."
        );
        return;
    }

    try {
        const commitID = uuidv4();
        const commitDir = path.join(commitPath, commitID);

        await fs.mkdir(commitDir, { recursive: true });

        // Copy entire staging area recursively
        await fs.cp(stagedPath, commitDir, {
            recursive: true
        });

        // Store commit metadata
        await fs.writeFile(
            path.join(commitDir, "commit.json"),
            JSON.stringify(
                {
                    message,
                    date: new Date().toISOString()
                },
                null,
                2
            )
        );

        // Clear staging area
        await fs.rm(stagedPath, {
            recursive: true,
            force: true
        });

        // Recreate empty staging directory
        await fs.mkdir(stagedPath, {
            recursive: true
        });

        console.log(
            `commit ${commitID} created with message "${message}"`
        );
    } catch (err) {
        console.error("error committing files:", err);
    }
};

export { commitRepo };