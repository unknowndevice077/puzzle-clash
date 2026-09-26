import type { BestOf, Difficulty, PicturePack, QueueState, RoomState } from '@pc/shared';
import { useApp } from '../store';
import { call } from './socket';

function report<T>(res: { ok: true; data: T } | { ok: false; error: string }): T | null {
  if (res.ok) return res.data;
  useApp.getState().toast({ kind: 'error', message: res.error });
  return null;
}

export const actions = {
  createRoom: async (difficulty: Difficulty, bestOf: BestOf, pack: PicturePack) =>
    report(await call<RoomState>((s, cb) => s.emit('room:create', { difficulty, bestOf, pack }, cb))),
  joinRoom: async (code: string) => report(await call<RoomState>((s, cb) => s.emit('room:join', { code: code.toUpperCase() }, cb))),
  updateRoom: async (difficulty: Difficulty, bestOf: BestOf, pack: PicturePack) =>
    report(await call<RoomState>((s, cb) => s.emit('room:update', { difficulty, bestOf, pack }, cb))),
  startRoom: async () => report(await call<undefined>((s, cb) => s.emit('room:start', cb))),
  leaveRoom: async () => report(await call<undefined>((s, cb) => s.emit('room:leave', cb))),
  joinQueue: async (difficulty: Difficulty) => report(await call<QueueState>((s, cb) => s.emit('queue:join', { difficulty }, cb))),
  leaveQueue: async () => report(await call<undefined>((s, cb) => s.emit('queue:leave', cb))),
  solo: async (difficulty: Difficulty, pack: 'ghibli' | 'photos') => report(await call<undefined>((s, cb) => s.emit('solo:start', { difficulty, pack }, cb))),
  rematch: async () => report(await call<undefined>((s, cb) => s.emit('match:rematch', cb))),
  leaveMatch: async () => {
    await call<undefined>((s, cb) => s.emit('match:leave', cb));
    useApp.getState().setMatch(null);
  },
};
