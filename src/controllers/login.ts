import * as readline from 'readline';
import { saveGlobalConfig } from '../utils/globalConfig.js';

const SERVER_URL = 'http://localhost:3000';

export async function loginUser() {
  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout
  });

  const question = (q: string) =>
    new Promise<string>(resolve => rl.question(q, resolve));

  const username = await question('Username: ');
  const password = await question('Password: ');
  rl.close();

  // Step 1: Try login first
  const loginRes = await fetch(`http://localhost:3000/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const loginData = await loginRes.json();

  // Step 2: If login succeeded, save and done
  if (loginData.ok===true) {
    await saveGlobalConfig({
      username: loginData.username,
      userId: loginData.userId,
      token: loginData.token,
      serverUrl: SERVER_URL
    });
    console.log(`Logged in as ${username}`);
    return;
  }

  // Step 3: If user doesn't exist, auto-register them
  if (loginData.message === 'User not found') {
    console.log('No account found. Creating one for you...');

    const registerRes = await fetch(`http://localhost:3000/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const registerData = await registerRes.json();

    if (!registerRes.ok) {
      console.error('Registration failed:', registerData.message);
      return;
    }

    await saveGlobalConfig({
      username: registerData.username,
      userId: registerData.userId,
      token: registerData.token,
      serverUrl: SERVER_URL
    });
    console.log(`Account created and logged in as ${username}`);
    return;
  }

  // Step 4: Any other error (wrong password, server error, etc.)
  console.error('Login failed:', loginData.message);
}