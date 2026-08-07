import fs from 'fs/promises';
import path from 'path';

interface RepoConfig {
  name: string;
}

/**
 * Reads and parses the repository configuration from .myGit/config.json
 * Returns the config object, or null if the repository hasn't been initialized.
 */

export async function readRepoConfig(): Promise<RepoConfig | null> {
  try {
    const configPath = path.join(process.cwd(), '.snapkeep', 'config.json');
    const fileContent = await fs.readFile(configPath, 'utf-8');
    
    return JSON.parse(fileContent) as RepoConfig;
  } catch (error: any) {
    // ENOENT means the file or directory doesn't exist
    if (error.code === 'ENOENT') {
      console.error("Error: Not a snapkeep repository. Please run 'snapkeep init' first.");
    } else {
      console.error("Failed to read repository configuration:", error.message);
    }
    return null;
  }
}