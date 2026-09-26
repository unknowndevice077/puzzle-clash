import { createHash, randomBytes, randomInt } from 'node:crypto';
import { nameSchema } from '@pc/shared';

type Fields = Record<string, unknown>;
const emit = (level: string, msg: string, fields?: Fields) => {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
};

export const log = {
  info: (msg: string, f?: Fields) => emit('info', msg, f),
  warn: (msg: string, f?: Fields) => emit('warn', msg, f),
  error: (msg: string, f?: Fields) => emit('error', msg, f),
};

export const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const newId = (prefix = '') => prefix + randomBytes(9).toString('base64url');
export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const randomSeed = () => randomInt(1, 2 ** 31 - 1);

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCode(len = 5): string {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return s;
}

const hex = (c: number) => '\\u' + c.toString(16).padStart(4, '0');
const INVISIBLE = new RegExp(`[${hex(0)}-${hex(0x1f)}${hex(0x7f)}-${hex(0x9f)}${hex(0x200b)}-${hex(0x200f)}${hex(0x2028)}-${hex(0x202e)}${hex(0x2066)}-${hex(0x2069)}]`, 'g');

/** Cleans a display name; returns null if it isn't acceptable. */
export function cleanName(raw: string): string | null {
  const s = raw.normalize('NFKC').replace(INVISIBLE, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  const parsed = nameSchema.safeParse(s);
  return parsed.success ? parsed.data : null;
}

/** Token bucket for per-socket rate limiting. */
export class Bucket {
  private tokens: number;
  private last = Date.now();
  constructor(
    private readonly rate: number,
    private readonly burst: number,
  ) {
    this.tokens = burst;
  }
  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
