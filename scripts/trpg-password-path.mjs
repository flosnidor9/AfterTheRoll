import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stagedArchive = path.join(rootDir, 'passwords.enc.json');
const privateRepository = process.env.TRPG_LOGS_PATH
  ? path.resolve(process.env.TRPG_LOGS_PATH)
  : path.resolve(rootDir, '..', 'Trpg-Logs');

// CI stages the private backup at the root. Local tools use the private repo.
export const passwordArchivePath = fs.existsSync(stagedArchive)
  ? stagedArchive
  : path.join(privateRepository, 'passwords.enc.json');
