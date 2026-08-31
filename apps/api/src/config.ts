import 'dotenv/config';
import { z } from 'zod';
export const config = z.object({
  NODE_ENV:z.enum(['development','test','production']).default('development'), PORT:z.coerce.number().default(4000),
  DATABASE_URL:z.string().min(1), JWT_SECRET:z.string().min(32), JWT_REFRESH_SECRET:z.string().min(32),
  APP_URL:z.string().url().default('http://localhost:5173'), CORS_ORIGINS:z.string().default('http://localhost:5173'), REFRESH_TOKEN_DAYS:z.coerce.number().default(30)
}).parse(process.env);
