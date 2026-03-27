import { Router, Request, Response } from 'express';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const router = Router();

const KEY_DIR = path.join(os.homedir(), '.ssh');
const KEY_PATH = path.join(KEY_DIR, 'phoung_agent');
const PUB_PATH = `${KEY_PATH}.pub`;

router.get('/ssh-key', async (req: Request, res: Response) => {
  try {
    if (fs.existsSync(PUB_PATH)) {
      const publicKey = fs.readFileSync(PUB_PATH, 'utf-8').trim();
      res.json({ exists: true, public_key: publicKey });
    } else {
      res.json({ exists: false, public_key: null });
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read SSH key' });
  }
});

router.post('/ssh-key/generate', async (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(KEY_DIR)) {
      fs.mkdirSync(KEY_DIR, { mode: 0o700, recursive: true });
    }

    if (fs.existsSync(KEY_PATH)) {
      const publicKey = fs.readFileSync(PUB_PATH, 'utf-8').trim();
      res.json({ created: false, message: 'Key already exists', public_key: publicKey });
      return;
    }

    execSync(
      `ssh-keygen -t ed25519 -C "phoung-agent" -f "${KEY_PATH}" -N ""`,
      { stdio: 'pipe' }
    );

    const publicKey = fs.readFileSync(PUB_PATH, 'utf-8').trim();

    // Configure SSH to use this key for github.com if not already set
    const sshConfig = path.join(KEY_DIR, 'config');
    const marker = '# phoung-agent';
    const existingConfig = fs.existsSync(sshConfig) ? fs.readFileSync(sshConfig, 'utf-8') : '';
    if (!existingConfig.includes(marker)) {
      const block = `\n${marker}\nHost github.com\n  IdentityFile ${KEY_PATH}\n  AddKeysToAgent yes\n  StrictHostKeyChecking accept-new\n`;
      fs.appendFileSync(sshConfig, block);
      fs.chmodSync(sshConfig, 0o600);
    }

    res.json({ created: true, public_key: publicKey });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate SSH key' });
  }
});

export default router;
