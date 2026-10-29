import { readGlobalConfig } from "../utils/globalConfig.js";

export async function checkLoggedIn() {
  const config = await readGlobalConfig();
  if (!config) {
    console.error("User not logged in. Please login first.");
    process.exit(1);
  }
  return config;
}
