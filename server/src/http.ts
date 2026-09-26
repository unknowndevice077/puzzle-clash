import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import sharp from 'sharp';
import { DIFFICULTIES, MAX_UPLOAD_BYTES, sessionSchema, type Difficulty } from '@pc/shared';
import { config } from './config';
import type { Store } from './db';
import type { Lobby } from './game/Lobby';
import type { PhotoLibrary } from './photos';
import { cleanName, errMessage, log, newId, newToken, sha256 } from './util/misc';

const DEFAULT_NAMES = ['Corner Piece', 'Edge Finder', 'Sky Sorter', 'Box Lid', 'Last Piece', 'Snap Artist'];

export function createApp(store: Store, photos: PhotoLibrary, lobby: Lobby): express.Express {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          'connect-src': ["'self'", 'ws:', 'wss:'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          // On plain-http LAN play this would rewrite asset URLs to https and blank the page on phones.
          'upgrade-insecure-requests': config.https ? [] : null,
        },
      },
      strictTransportSecurity: config.https,
    }),
  );
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '8kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, photos: photos.count(), ...lobby.stats() });
  });

  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));

  /** Guest session: restore by token or create a new player. The token lives in the browser's localStorage. */
  app.post('/api/session', rateLimit({ windowMs: 15 * 60_000, limit: 60 }), (req, res) => {
    const body = sessionSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }
    const wanted = body.data.name ? cleanName(body.data.name) : null;
    if (body.data.name && !wanted) {
      res.status(400).json({ error: 'Names are 2-16 letters, numbers, spaces, _ . -' });
      return;
    }
    const existing = body.data.token ? store.byToken(sha256(body.data.token)) : undefined;
    if (existing) {
      if (wanted && wanted !== existing.name) {
        store.rename(existing.id, wanted);
        lobby.rename(existing.id, wanted);
        const sock = lobby.socketOf(existing.id);
        if (sock) sock.data.name = wanted;
      }
      res.json({ token: body.data.token, profile: store.profile(existing.id) });
      return;
    }
    const token = newToken();
    const id = newId('p_');
    store.create(id, wanted ?? `${DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)]} ${Math.floor(10 + Math.random() * 90)}`, sha256(token));
    res.json({ token, profile: store.profile(id) });
  });

  app.get('/api/photo/:token', (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const file = photos.resolve(String(req.params.token));
    if (!file) {
      res.status(404).json({ error: 'Picture link expired' });
      return;
    }
    res.type('image/jpeg').sendFile(file);
  });

  app.get('/api/best/:difficulty', (req, res) => {
    const d = String(req.params.difficulty);
    if (!(DIFFICULTIES as readonly string[]).includes(d)) {
      res.status(404).json({ error: 'Unknown difficulty' });
      return;
    }
    res.json({ entries: store.leaderboard(d as Difficulty) });
  });

  /**
   * Host uploads for "Our own pictures" in friend rooms. The body is the raw image; the file type is
   * checked by magic bytes and the image is fully re-encoded, so no original bytes are ever served.
   */
  app.post(
    '/api/rooms/:code/pictures',
    rateLimit({ windowMs: 60_000, limit: 30 }),
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'], limit: MAX_UPLOAD_BYTES }),
    (req, res, next) => {
      const token = req.header('x-player-token');
      const player = token ? store.byToken(sha256(token)) : undefined;
      const code = String(req.params.code);
      if (!player || !lobby.isHost(code, player.id)) {
        res.status(403).json({ error: 'Only the room host can add pictures' });
        return;
      }
      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || !isImage(buf)) {
        res.status(400).json({ error: 'Use a JPEG, PNG or WebP image' });
        return;
      }
      sharp(buf, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(1024, 768, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 86 })
        .toBuffer()
        .then(async (jpeg) => {
          const rawTitle = decodeURIComponent(String(req.header('x-picture-title') ?? ''));
          const title = cleanName(rawTitle.slice(0, 16)) ?? 'Our picture';
          const added = await photos.addUpload(code, jpeg, title);
          if (!added.ok) {
            res.status(400).json({ error: added.error });
            return;
          }
          lobby.notifyRoom(code);
          res.json({ count: added.count });
        })
        .catch(next);
    },
  );

  /** Addresses other devices on the same Wi-Fi can use (local play only). */
  app.get('/api/network', (_req, res) => {
    res.json({ urls: config.isProd ? [] : lanUrls(config.port) });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const index = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(index)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '7d' }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(index);
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    log.error('http error', { error: errMessage(err) });
    res.status(500).json({ error: 'Internal error' });
  });
  return app;
}

function isImage(b: Buffer): boolean {
  if (b.length < 12) return false;
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP';
  return jpeg || png || webp;
}

const VIRTUAL = /vEthernet|WSL|Docker|Hyper-V|VirtualBox|VMware|ZeroTier|Tailscale|Loopback|utun|tun\d|br-|veth/i;

function lanUrls(port: number): string[] {
  const out: string[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) out.push(a.address);
    }
  }
  out.sort((a, b) => Number(!a.startsWith('192.168.')) - Number(!b.startsWith('192.168.')));
  return out.map((ip) => `http://${ip}:${port}`);
}
