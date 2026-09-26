import type { BestOf, Difficulty, PicturePack, QueueState, RoomState } from '@pc/shared';
import type { Store } from '../db';
import type { PhotoLibrary } from '../photos';
import type { IO, Sock } from '../types';
import { log, newCode } from '../util/misc';
import { Match } from './Match';

interface Room {
  code: string;
  hostId: string;
  difficulty: Difficulty;
  bestOf: BestOf;
  pack: PicturePack;
  players: string[];
  matchId: string | null;
  createdAt: number;
}

interface QueueEntry {
  playerId: string;
  difficulty: Difficulty;
  since: number;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ROOM_IDLE_MS = 30 * 60_000;

/** Presence, friend rooms, the quick-match queue, solo runs and the live match registry. */
export class Lobby {
  private readonly sockets = new Map<string, string>();
  private readonly names = new Map<string, string>();
  private readonly rooms = new Map<string, Room>();
  private readonly roomOf = new Map<string, string>();
  private readonly queue: QueueEntry[] = [];
  private readonly matches = new Map<string, Match>();
  private readonly matchOf = new Map<string, string>();

  constructor(
    private readonly io: IO,
    private readonly store: Store,
    private readonly photos: PhotoLibrary,
  ) {
    setInterval(() => this.sweep(), 60_000).unref();
  }

  // ------------------------------------------------------------------ presence

  connect(sock: Sock): void {
    const id = sock.data.playerId;
    const prev = this.sockets.get(id);
    if (prev && prev !== sock.id) {
      const old = this.io.sockets.sockets.get(prev);
      old?.emit('notice', { kind: 'info', message: 'You opened the game in another tab.' });
      old?.disconnect(true);
    }
    this.sockets.set(id, sock.id);
    this.names.set(id, sock.data.name);
    const room = this.roomFor(id);
    if (room) {
      void sock.join(this.roomChannel(room.code));
      this.broadcastRoom(room);
    }
    this.matchFor(id)?.attach(id, sock);
    sock.emit('queue:state', this.queueState(id));
  }

  disconnect(sock: Sock): void {
    const id = sock.data.playerId;
    if (this.sockets.get(id) !== sock.id) return;
    this.sockets.delete(id);
    this.leaveQueue(id);
    this.matchFor(id)?.handleDisconnect(id);
    const room = this.roomFor(id);
    if (room) this.broadcastRoom(room);
  }

  socketOf = (playerId: string): Sock | undefined => {
    const sid = this.sockets.get(playerId);
    return sid ? this.io.sockets.sockets.get(sid) : undefined;
  };

  rename(playerId: string, name: string): void {
    this.names.set(playerId, name);
  }

  // ------------------------------------------------------------------ matches

  matchFor(playerId: string): Match | undefined {
    const id = this.matchOf.get(playerId);
    return id ? this.matches.get(id) : undefined;
  }

  private createMatch(mode: Match['mode'], difficulty: Difficulty, bestOf: BestOf, pack: PicturePack, playerIds: string[], roomCode: string | null): Match {
    const match = new Match(
      {
        io: this.io,
        store: this.store,
        photos: this.photos,
        socketOf: this.socketOf,
        onClosed: (m) => this.onMatchClosed(m),
        onRematch: (m) => this.rematch(m),
      },
      mode,
      difficulty,
      bestOf,
      pack,
      playerIds.map((id) => ({ id, name: this.names.get(id) ?? 'Player' })),
      roomCode,
    );
    this.matches.set(match.id, match);
    for (const id of playerIds) {
      this.leaveQueue(id);
      this.matchOf.set(id, match.id);
    }
    // Players learn who they're facing first; start() then sends the round setup and countdown.
    for (const id of playerIds) this.socketOf(id)?.emit('match:snapshot', match.snapshotFor(id));
    match.start();
    return match;
  }

  private onMatchClosed(m: Match): void {
    this.matches.delete(m.id);
    for (const [pid, mid] of this.matchOf) if (mid === m.id) this.matchOf.delete(pid);
    for (const room of this.rooms.values()) {
      if (room.matchId === m.id) {
        room.matchId = null;
        this.broadcastRoom(room);
      }
    }
  }

  private rematch(old: Match): void {
    const ids = old.playerIds().filter((id) => this.sockets.has(id));
    old.close();
    if (!ids.length) return;
    const m = this.createMatch(old.mode, old.difficulty, old.bestOf, old.pack, ids, old.roomCode);
    const room = old.roomCode ? this.rooms.get(old.roomCode) : undefined;
    if (room) {
      room.matchId = m.id;
      this.broadcastRoom(room);
    }
  }

  leaveMatch(playerId: string): void {
    const m = this.matchFor(playerId);
    if (!m) return;
    m.abandon(playerId);
    this.matchOf.delete(playerId);
  }

  startSolo(playerId: string, difficulty: Difficulty, pack: PicturePack): Result<null> {
    if (this.matchFor(playerId) && !this.matchFor(playerId)?.isOver()) return { ok: false, error: 'Finish your current match first' };
    this.leaveMatch(playerId);
    this.createMatch('solo', difficulty, 1, pack, [playerId], null);
    return { ok: true, value: null };
  }

  // ------------------------------------------------------------------ quick match queue

  private queueState(playerId: string): QueueState {
    const e = this.queue.find((q) => q.playerId === playerId);
    return { searching: !!e, difficulty: e?.difficulty ?? null, since: e?.since ?? 0 };
  }

  joinQueue(playerId: string, difficulty: Difficulty): Result<QueueState> {
    if (this.matchFor(playerId) && !this.matchFor(playerId)?.isOver()) return { ok: false, error: 'You are already in a match' };
    this.leaveMatch(playerId);
    this.leaveRoom(playerId);
    this.leaveQueue(playerId);
    const opponent = this.queue.find((q) => q.difficulty === difficulty && q.playerId !== playerId && this.sockets.has(q.playerId));
    if (opponent) {
      this.createMatch('quick', difficulty, 3, 'ghibli', [opponent.playerId, playerId], null);
      return { ok: true, value: { searching: false, difficulty, since: 0 } };
    }
    const entry = { playerId, difficulty, since: Date.now() };
    this.queue.push(entry);
    return { ok: true, value: this.queueState(playerId) };
  }

  leaveQueue(playerId: string): void {
    const i = this.queue.findIndex((q) => q.playerId === playerId);
    if (i < 0) return;
    this.queue.splice(i, 1);
    this.socketOf(playerId)?.emit('queue:state', this.queueState(playerId));
  }

  searchingCount(): number {
    return this.queue.length;
  }

  // ------------------------------------------------------------------ friend rooms

  private roomChannel(code: string): string {
    return `room:${code}`;
  }

  private roomFor(playerId: string): Room | undefined {
    const code = this.roomOf.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  private roomState(room: Room): RoomState {
    return {
      code: room.code,
      hostId: room.hostId,
      difficulty: room.difficulty,
      bestOf: room.bestOf,
      pack: room.pack,
      uploads: this.photos.uploadCount(room.code),
      players: room.players.map((id) => ({ id, name: this.names.get(id) ?? this.store.byId(id)?.name ?? 'Player', connected: this.sockets.has(id) })),
      matchId: room.matchId,
    };
  }

  notifyRoom(code: string): void {
    const room = this.rooms.get(code);
    if (room) this.broadcastRoom(room);
  }

  isHost(code: string, playerId: string): boolean {
    return this.rooms.get(code)?.hostId === playerId;
  }

  private broadcastRoom(room: Room): void {
    this.io.to(this.roomChannel(room.code)).emit('room:state', this.roomState(room));
  }

  createRoom(playerId: string, difficulty: Difficulty, bestOf: BestOf, pack: PicturePack): Result<RoomState> {
    this.leaveQueue(playerId);
    this.leaveRoom(playerId);
    let code = newCode();
    while (this.rooms.has(code)) code = newCode();
    const room: Room = { code, hostId: playerId, difficulty, bestOf, pack, players: [playerId], matchId: null, createdAt: Date.now() };
    this.rooms.set(code, room);
    this.roomOf.set(playerId, code);
    void this.socketOf(playerId)?.join(this.roomChannel(code));
    log.info('room created', { code });
    return { ok: true, value: this.roomState(room) };
  }

  joinRoom(playerId: string, code: string): Result<RoomState> {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'That room does not exist (check the code)' };
    if (!room.players.includes(playerId)) {
      if (room.players.length >= 2) return { ok: false, error: 'That room is full' };
      this.leaveQueue(playerId);
      this.leaveRoom(playerId);
      room.players.push(playerId);
      this.roomOf.set(playerId, code);
    }
    void this.socketOf(playerId)?.join(this.roomChannel(code));
    this.broadcastRoom(room);
    return { ok: true, value: this.roomState(room) };
  }

  updateRoom(playerId: string, difficulty: Difficulty, bestOf: BestOf, pack: PicturePack): Result<RoomState> {
    const room = this.roomFor(playerId);
    if (!room) return { ok: false, error: 'You are not in a room' };
    if (room.hostId !== playerId) return { ok: false, error: 'Only the host can change settings' };
    if (room.matchId) return { ok: false, error: 'A match is in progress' };
    room.difficulty = difficulty;
    room.bestOf = bestOf;
    room.pack = pack;
    this.broadcastRoom(room);
    return { ok: true, value: this.roomState(room) };
  }

  startRoom(playerId: string): Result<null> {
    const room = this.roomFor(playerId);
    if (!room) return { ok: false, error: 'You are not in a room' };
    if (room.hostId !== playerId) return { ok: false, error: 'Only the host can start' };
    if (room.matchId) return { ok: false, error: 'A match is already running' };
    if (room.players.length < 2) return { ok: false, error: 'Waiting for an opponent to join' };
    if (room.players.some((id) => !this.sockets.has(id))) return { ok: false, error: 'Your opponent is offline' };
    if (room.pack === 'custom' && this.photos.uploadCount(room.code) === 0) return { ok: false, error: 'Upload at least one picture first' };
    for (const id of room.players) this.leaveMatch(id);
    const m = this.createMatch('friend', room.difficulty, room.bestOf, room.pack, room.players, room.code);
    room.matchId = m.id;
    this.broadcastRoom(room);
    return { ok: true, value: null };
  }

  leaveRoom(playerId: string): void {
    const room = this.roomFor(playerId);
    if (!room) return;
    room.players = room.players.filter((id) => id !== playerId);
    this.roomOf.delete(playerId);
    const sock = this.socketOf(playerId);
    void sock?.leave(this.roomChannel(room.code));
    sock?.emit('room:state', null);
    if (!room.players.length) {
      this.rooms.delete(room.code);
      void this.photos.clearUploads(room.code);
      return;
    }
    if (room.hostId === playerId) room.hostId = room.players[0];
    this.broadcastRoom(room);
  }

  private sweep(): void {
    for (const room of this.rooms.values()) {
      const online = room.players.some((id) => this.sockets.has(id));
      if (!online && !room.matchId && Date.now() - room.createdAt > ROOM_IDLE_MS) {
        for (const id of room.players) this.roomOf.delete(id);
        this.rooms.delete(room.code);
        void this.photos.clearUploads(room.code);
      }
    }
  }

  stats(): { online: number; searching: number; matches: number } {
    return { online: this.sockets.size, searching: this.queue.length, matches: this.matches.size };
  }
}
