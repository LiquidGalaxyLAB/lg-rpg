import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
export const rootDir = path.dirname(path.dirname(__filename));
export const publicDir = path.join(rootDir, 'public');
