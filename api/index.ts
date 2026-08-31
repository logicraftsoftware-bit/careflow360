import type { Request, Response } from 'express';
import { app } from '../apps/api/src/app.js';

export default function handler(req: Request, res: Response) {
  const forwardedPath = req.query.path;
  if (typeof forwardedPath === 'string') {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'path') continue;
      if (Array.isArray(value)) value.forEach((item) => query.append(key, String(item)));
      else if (typeof value === 'string') query.set(key, value);
    }
    req.url = `/api/${forwardedPath}${query.size ? `?${query}` : ''}`;
  }
  return app(req, res);
}
