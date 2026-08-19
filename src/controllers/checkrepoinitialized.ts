import { readRepoConfig, type RepoConfig } from "../utils/readConfig.json.js";

export async function checkRepoInitialized(): Promise<RepoConfig | null> {
  return readRepoConfig();
}
