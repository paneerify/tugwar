import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const targetPath = new URL('../static/js/firebaseRuntimeConfig.js', import.meta.url);
const config = {
  apiKey: process.env.TUGWAR_FIREBASE_API_KEY || '',
  authDomain: process.env.TUGWAR_FIREBASE_AUTH_DOMAIN || '',
  databaseURL: process.env.TUGWAR_FIREBASE_DATABASE_URL || '',
  projectId: process.env.TUGWAR_FIREBASE_PROJECT_ID || '',
  appId: process.env.TUGWAR_FIREBASE_APP_ID || ''
};

const fileContents = `window.__TUGWAR_FIREBASE__ = ${JSON.stringify(config, null, 2)};\n`;

await mkdir(dirname(targetPath.pathname), { recursive: true });
await writeFile(targetPath, fileContents, 'utf8');
console.log('Generated static/js/firebaseRuntimeConfig.js');
