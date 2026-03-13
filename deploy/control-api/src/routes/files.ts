import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

const OPENCLAW_DATA_PATH = process.env.OPENCLAW_DATA_PATH || path.join(process.env.HOME || '/root', '.openclaw');

function resolvePath(requestedPath: string): { fullPath: string; isValid: boolean } {
  const normalized = path.normalize(requestedPath).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = path.join(OPENCLAW_DATA_PATH, normalized);
  
  const isValid = fullPath.startsWith(OPENCLAW_DATA_PATH);
  return { fullPath, isValid };
}

router.get('/files', (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(OPENCLAW_DATA_PATH)) {
      res.json([]);
      return;
    }
    
    const files: string[] = [];
    
    function scanDir(dir: string, baseDir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);
        
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scanDir(fullPath, baseDir);
          }
        } else if (entry.isFile()) {
          files.push(relativePath);
        }
      }
    }
    
    scanDir(OPENCLAW_DATA_PATH, OPENCLAW_DATA_PATH);
    res.json(files.sort());
  } catch (err) {
    console.error('Error listing files:', err);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

router.get('/files/*', (req: Request, res: Response) => {
  const requestedPath = req.params[0];
  const { fullPath, isValid } = resolvePath(requestedPath);
  
  if (!isValid) {
    res.status(403).json({ error: 'Invalid file path' });
    return;
  }
  
  try {
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      res.status(400).json({ error: 'Path is not a file' });
      return;
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({
      path: requestedPath,
      content,
      size: stats.size,
      modified: stats.mtime,
    });
  } catch (err) {
    console.error('Error reading file:', err);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

router.put('/files/*', (req: Request, res: Response) => {
  const requestedPath = req.params[0];
  const { content } = req.body;
  
  if (typeof content !== 'string') {
    res.status(400).json({ error: 'Content must be a string' });
    return;
  }
  
  const { fullPath, isValid } = resolvePath(requestedPath);
  
  if (!isValid) {
    res.status(403).json({ error: 'Invalid file path' });
    return;
  }
  
  try {
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(fullPath, content, 'utf-8');
    
    const stats = fs.statSync(fullPath);
    res.json({
      path: requestedPath,
      size: stats.size,
      modified: stats.mtime,
    });
  } catch (err) {
    console.error('Error writing file:', err);
    res.status(500).json({ error: 'Failed to write file' });
  }
});

export default router;
