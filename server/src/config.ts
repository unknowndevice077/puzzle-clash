import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(5070),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5174'),
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  HTTPS: z.enum(['true', 'false', '1', '0']).optional(),
  DATA_DIR: z.string().default('./data'),
  PHOTOS_DIR: z.string().default('./photos'),
  CLIENT_DIST: z.string().default('../client/dist'),
  MAX_CONN_PER_IP: z.coerce.number().int().default(12),
});

const env = Env.parse(process.env);
const isProd = env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: env.PORT,
  host: env.HOST,
  corsOrigins: env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY,
  /** Served over https (Render etc.): enables HSTS and upgrade-insecure-requests. */
  https: env.HTTPS === undefined ? isProd : env.HTTPS === 'true' || env.HTTPS === '1',
  dataDir: path.resolve(env.DATA_DIR),
  photosDir: path.resolve(env.PHOTOS_DIR),
  clientDist: path.resolve(env.CLIENT_DIST),
  maxConnPerIp: env.MAX_CONN_PER_IP,
} as const;
