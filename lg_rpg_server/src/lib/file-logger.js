import fs from 'fs';
import path from 'path';
import { rootDir } from '../paths.js';

const LOG_PATH = path.join(rootDir, 'logs', 'server.log');
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
const stream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

for (const level of ['log', 'warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    const line = args
      .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.stack || a.message : JSON.stringify(a)))
      .join(' ');
    stream.write(`${new Date().toISOString()} [${level}] ${line}\n`);
    original(...args);
  };
}

// Route process-level crashes through console.error so they reach the log file too.
process.on('unhandledRejection', (err) => console.error('[fatal] unhandledRejection:', err));
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
  process.exit(1);
});
