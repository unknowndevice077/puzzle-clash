import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { z } from 'zod';
import { difficultySchema, placeSchema, roomConfigSchema, roomJoinSchema, soloSchema, type Ack } from '@pc/shared';
import { config } from './config';
import type { Store } from './db';
import type { Lobby } from './game/Lobby';
import type { IO, Sock } from './types';
import { Bucket, errMessage, log, sha256 } from './util/misc';

type AckFn<T> = (res: Ack<T>) => void;

export function createIo(http: HttpServer): IO {
  return new Server(http, { cors: { origin: config.corsOrigins }, maxHttpBufferSize: 16 * 1024, pingInterval: 10_000, pingTimeout: 8_000 });
}

function ipOf(sock: Sock): string {
  const fwd = sock.handshake.headers['x-forwarded-for'];
  return config.trustProxy && typeof fwd === 'string' ? fwd.split(',')[0].trim() : sock.handshake.address;
}

export function attachSockets(io: IO, lobby: Lobby, store: Store): void {
  const perIp = new Map<string, number>();

  io.use((sock, next) => {
    const ip = ipOf(sock);
    if ((perIp.get(ip) ?? 0) >= config.maxConnPerIp) return next(new Error('too_many_connections'));
    const token = (sock.handshake.auth as { token?: unknown }).token;
    const row = typeof token === 'string' ? store.byToken(sha256(token)) : undefined;
    if (!row) return next(new Error('unauthorized'));
    sock.data.playerId = row.id;
    sock.data.name = row.name;
    next();
  });

  io.on('connection', (sock) => {
    const ip = ipOf(sock);
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    const me = sock.data.playerId;
    store.touch(me);
    lobby.connect(sock);
    const profile = store.profile(me);
    if (profile) sock.emit('session:profile', profile);

    const general = new Bucket(8, 20);
    const moves = new Bucket(25, 40);

    /** Rate limit + zod validation + error isolation for ack-style events. */
    const handle =
      <S extends z.ZodTypeAny, R>(schema: S, fn: (input: z.infer<S>) => { ok: true; value: R } | { ok: false; error: string }) =>
      (payload: unknown, cb?: AckFn<R>) => {
        const reply = (res: Ack<R>) => typeof cb === 'function' && cb(res);
        if (!general.take()) return reply({ ok: false, error: 'Slow down a little' });
        const parsed = schema.safeParse(payload);
        if (!parsed.success) return reply({ ok: false, error: 'Invalid request' });
        try {
          const res = fn(parsed.data);
          reply(res.ok ? { ok: true, data: res.value } : { ok: false, error: res.error });
        } catch (err) {
          log.error('handler failed', { error: errMessage(err) });
          reply({ ok: false, error: 'Something went wrong' });
        }
      };
    const simple = (fn: () => string | null) => (cb?: AckFn<undefined>) => {
      if (!general.take()) return cb?.({ ok: false, error: 'Slow down a little' });
      const err = fn();
      cb?.(err ? { ok: false, error: err } : { ok: true, data: undefined });
    };

    sock.on('time:ping', (_t, cb) => {
      if (typeof cb === 'function' && general.take()) cb(Date.now());
    });

    sock.on('room:create', handle(roomConfigSchema, (i) => lobby.createRoom(me, i.difficulty, i.bestOf, i.pack)));
    sock.on('room:join', handle(roomJoinSchema, (i) => lobby.joinRoom(me, i.code)));
    sock.on('room:update', handle(roomConfigSchema, (i) => lobby.updateRoom(me, i.difficulty, i.bestOf, i.pack)));
    sock.on(
      'room:start',
      simple(() => {
        const r = lobby.startRoom(me);
        return r.ok ? null : r.error;
      }),
    );
    sock.on(
      'room:leave',
      simple(() => {
        lobby.leaveRoom(me);
        return null;
      }),
    );

    sock.on('queue:join', handle(difficultySchema, (i) => lobby.joinQueue(me, i.difficulty)));
    sock.on(
      'queue:leave',
      simple(() => {
        lobby.leaveQueue(me);
        return null;
      }),
    );
    sock.on('solo:start', (payload, cb) => {
      handle(soloSchema, (i) => lobby.startSolo(me, i.difficulty, i.pack))(payload, (res) => cb(res.ok ? { ok: true, data: undefined } : res));
    });

    sock.on('piece:place', (payload) => {
      if (!moves.take()) return;
      const parsed = placeSchema.safeParse(payload);
      if (parsed.success) lobby.matchFor(me)?.place(me, parsed.data);
    });
    sock.on('match:rematch', simple(() => lobby.matchFor(me)?.voteRematch(me) ?? 'No match to rematch'));
    sock.on(
      'match:leave',
      simple(() => {
        lobby.leaveMatch(me);
        return null;
      }),
    );
    sock.on('match:resync', (cb) => {
      const m = lobby.matchFor(me);
      if (typeof cb !== 'function') return;
      if (!m) return cb({ ok: false, error: 'No active match' });
      cb({ ok: true, data: m.snapshotFor(me) });
    });

    sock.on('disconnect', () => {
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n <= 0) perIp.delete(ip);
      else perIp.set(ip, n);
      lobby.disconnect(sock);
    });
  });
}
