import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { MAX_UPLOADS_PER_ROOM, type Attribution, type PicturePack } from '@pc/shared';
import { config } from './config';
import { log, newId, newToken } from './util/misc';

export interface Photo {
  id: string;
  pack: PicturePack;
  title: string;
  category: string;
  file: string;
  attribution: Attribution;
}

export interface ManifestPhoto {
  id: string;
  pack: 'ghibli' | 'photos';
  title: string;
  category: string;
  file: string;
  author: string | null;
  sourceUrl: string | null;
  license: string;
  licenseUrl: string | null;
}

interface TokenEntry {
  file: string;
  playerId: string;
  expiresAt: number;
}

const TOKEN_TTL_MS = 10 * 60_000;

/** Curated photo library plus one-time, player-bound picture URLs (so nobody sees the next picture early). */
export class PhotoLibrary {
  private photos: Photo[] = [];
  private readonly tokens = new Map<string, TokenEntry>();
  private readonly uploads = new Map<string, Photo[]>();

  constructor() {
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.tokens) if (v.expiresAt < now) this.tokens.delete(k);
    }, 60_000).unref();
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(config.photosDir, 'photos.json'), 'utf8')) as { photos: ManifestPhoto[] };
      this.photos = raw.photos.map((p) => ({
        id: p.id,
        pack: p.pack ?? 'photos',
        title: p.title,
        category: p.category,
        file: path.resolve(config.photosDir, p.file),
        attribution: { title: p.title, author: p.author, sourceUrl: p.sourceUrl, license: p.license, licenseUrl: p.licenseUrl },
      }));
      log.info('photo library loaded', { count: this.photos.length });
    } catch {
      log.warn('no photos.json found; run `npm run photos:fetch`');
    }
  }

  count(pack?: PicturePack): number {
    return pack ? this.photos.filter((p) => p.pack === pack).length : this.photos.length;
  }

  /** Random picture from the pack, not used yet this match (repeats only once the pack runs out). */
  pick(pack: PicturePack, exclude: Set<string>, roomCode: string | null): Photo {
    const all = pack === 'custom' ? (roomCode ? (this.uploads.get(roomCode) ?? []) : []) : this.photos.filter((p) => p.pack === pack);
    const source = all.length ? all : this.photos;
    if (!source.length) throw new Error('Picture library is empty. Run `npm run photos:fetch`.');
    const pool = source.filter((p) => !exclude.has(p.id));
    const from = pool.length ? pool : source;
    return from[randomInt(from.length)];
  }

  /** Stores a host upload (already validated and re-encoded) for a friend room. */
  async addUpload(roomCode: string, jpeg: Buffer, title: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
    const list = this.uploads.get(roomCode) ?? [];
    if (list.length >= MAX_UPLOADS_PER_ROOM) return { ok: false, error: `Rooms hold up to ${MAX_UPLOADS_PER_ROOM} pictures` };
    const id = newId('up_');
    const dir = path.join(config.dataDir, 'uploads', roomCode);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${id}.jpg`);
    await fs.writeFile(file, jpeg);
    list.push({ id, pack: 'custom', title, category: 'custom', file, attribution: { title, author: null, sourceUrl: null, license: 'Uploaded by the room host', licenseUrl: null } });
    this.uploads.set(roomCode, list);
    return { ok: true, count: list.length };
  }

  uploadCount(roomCode: string): number {
    return this.uploads.get(roomCode)?.length ?? 0;
  }

  async clearUploads(roomCode: string): Promise<void> {
    this.uploads.delete(roomCode);
    await fs.rm(path.join(config.dataDir, 'uploads', roomCode), { recursive: true, force: true }).catch(() => undefined);
  }

  issue(photo: Photo, playerId: string): string {
    const token = newToken();
    this.tokens.set(token, { file: photo.file, playerId, expiresAt: Date.now() + TOKEN_TTL_MS });
    return `/api/photo/${token}`;
  }

  /** Tokens can be reused by their owner during the round (piece rendering may reload the image). */
  resolve(token: string): string | null {
    const e = this.tokens.get(token);
    if (!e || e.expiresAt < Date.now()) return null;
    return e.file;
  }
}
