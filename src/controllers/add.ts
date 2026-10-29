import { promises as fs } from "fs";
import path from "path";
import type { ArgumentsCamelCase } from "yargs";
import { checkLoggedIn } from "./checkloggedin.js";
import { checkRepoInitialized } from "./checkrepoinitialized.js";

type AddArgs = {
    files: string;
};

const ignoredFiles = new Set<string>();

/// function to avoid adding files present in .snapkeepignore
const getSnapkeepIgnoreFiles = async () => {
    ignoredFiles.clear();
    ignoredFiles.add(".snapkeep");
    ignoredFiles.add(".snapkeepignore");

    try {
        const content = await fs.readFile(".snapkeepignore", "utf-8");
        content
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .forEach(line => ignoredFiles.add(line));
    } catch (err: any) {
        if (err.code !== "ENOENT") throw err; // ignore missing file, rethrow anything else
    }
};

const isIgnored = (filePath: string): boolean => {
    const rel = path.relative(process.cwd(), filePath);
    if (!rel || rel === ".") return false;
    const normalized = rel.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return parts.some(part => ignoredFiles.has(part)) || ignoredFiles.has(normalized);
};

const addRepo = async (argv: ArgumentsCamelCase<AddArgs>) => {
    await checkLoggedIn();
    if (!(await checkRepoInitialized())) return;

    await getSnapkeepIgnoreFiles();

    const repoRoot = process.cwd();
    const repoPath = path.resolve(repoRoot, ".snapkeep");
    const stagingPath = path.join(repoPath, "staging");

    const inputPath = argv.files === "." ? repoRoot : argv.files;
    const sourcePath = path.resolve(repoRoot, inputPath);
    const relativePath = path.relative(repoRoot, sourcePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        console.error("Error: Path is outside the repository.");
        return;
    }

    try {
        await fs.mkdir(stagingPath, { recursive: true });

        const stats = await fs.stat(sourcePath);

        if (stats.isFile()) {
            if (isIgnored(sourcePath)) {
                return;
            }

            const destination = path.join(stagingPath, relativePath);
            await fs.mkdir(path.dirname(destination), { recursive: true });
            await fs.copyFile(sourcePath, destination);

            const displayPath = relativePath.replace(/\\/g, "/");
            console.log(`file ${displayPath} added to the staging area`);
        } else if (stats.isDirectory()) {
            const isRoot = relativePath === "" || relativePath === ".";
            const destination = isRoot ? stagingPath : path.join(stagingPath, relativePath);

            await fs.mkdir(destination, { recursive: true });
            await fs.cp(sourcePath, destination, {
                recursive: true,
                force: true,
                filter: (src) => !isIgnored(src)
            });

            const displayPath = isRoot ? "." : relativePath.replace(/\\/g, "/");
            console.log(`directory ${displayPath} added to the staging area`);
        } else {
            console.log(`${relativePath} is neither a file nor a directory`);
        }
    } catch (err) {
        console.error("error adding item:", err);
    }
};

export { addRepo };
