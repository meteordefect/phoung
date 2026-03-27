import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_BASE = process.env.UPLOAD_DIR || '/tmp/phoung-uploads';

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const uploadId = (req as any)._uploadId || uuidv4();
    (req as any)._uploadId = uploadId;
    const dir = path.join(UPLOAD_BASE, uploadId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
});

const router = Router();

router.post('/uploads', upload.array('files', 10), (req: Request, res: Response) => {
  const uploadId = (req as any)._uploadId;
  const files = (req.files as Express.Multer.File[]) || [];

  res.json({
    upload_id: uploadId,
    files: files.map((f) => ({ name: f.originalname, size: f.size })),
  });
});

export { UPLOAD_BASE };
export default router;
