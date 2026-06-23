  import os from 'os';
     import path from 'path';
     import { promises as fs } from 'fs';

     const CONFIG_PATH = path.join(os.homedir(), '.mygit', 'config.json');

     export async function saveGlobalConfig(data: object) {
     
       await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
       await fs.writeFile(CONFIG_PATH, JSON.stringify(data, null, 2));
     }

     export async function readGlobalConfig() {
       try {
         const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
         return JSON.parse(raw);
       } catch {
         return null;
       }
     }
