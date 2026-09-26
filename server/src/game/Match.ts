import {
  DIFFICULTY_SPECS,
  MIN_PLACE_INTERVAL_MS,
  SERVER_PLACE_TOLERANCE,
  TIMINGS,
  generatePuzzle,
  type BestOf,
  type Difficulty,
  type MatchMode,
  type MatchPhase,
  type MatchPlayer,
  type MatchResult,
  type MatchSnapshot,
  type PicturePack,
  type PhaseInfo,
  type PlaceInput,
  type Point,
  type RoundResult,
  type RoundSetup,
} from '@pc/shared';
import type { Store } from '../db';
import type { Photo, PhotoLibrary } from '../photos';
import type { IO, Sock } from '../types';
import { errMessage, log, newId, randomSeed } from '../util/misc';

export interface MatchDeps {
  io: IO;
  store: Store;
  photos: PhotoLibrary;
  socketOf: (playerId: string) => Sock | undefined;
  onClosed: (m: Match) => void;
  onRematch: (m: Match) => void;
}

interface Participant {
  id: string;
  name: string;
  connected: boolean;
  left: boolean;
  score: number;
  placed: Set<number>;
  finishMs: number | null;
  lastPlaceAt: number;
  dcTimer: NodeJS.Timeout | null;
}

interface Round {
  number: number;
  seed: number;
  photo: Photo;
  homes: Point[];
  total: number;
}

/** One PvP race (or a solo practice run). The server is the referee: it times rounds and validates every placement. */
export class Match {
  readonly id = newId('m_');
  private readonly players = new Map<string, Participant>();
  private phase: MatchPhase = 'COUNTDOWN';
  private endsAt = 0;
  private roundStartedAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private round: Round | null = null;
  private roundNo = 0;
  private readonly usedPhotos = new Set<string>();
  private readonly results: RoundResult[] = [];
  private result: MatchResult | null = null;
  private readonly rematchVotes = new Set<string>();
  private closed = false;

  constructor(
    private readonly deps: MatchDeps,
    readonly mode: MatchMode,
    readonly difficulty: Difficulty,
    readonly bestOf: BestOf,
    readonly pack: PicturePack,
    seats: Array<{ id: string; name: string }>,
    readonly roomCode: string | null = null,
  ) {
    for (const s of seats) {
      this.players.set(s.id, { id: s.id, name: s.name, connected: true, left: false, score: 0, placed: new Set(), finishMs: null, lastPlaceAt: 0, dcTimer: null });
    }
  }

  get channel(): string {
    return `m:${this.id}`;
  }

  playerIds(): string[] {
    return [...this.players.keys()];
  }

  seats(): Array<{ id: string; name: string }> {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name }));
  }

  has(playerId: string): boolean {
    return this.players.has(playerId);
  }

  isOver(): boolean {
    return this.phase === 'MATCH_END' || this.closed;
  }

  private get winsNeeded(): number {
    return Math.ceil(this.bestOf / 2);
  }

  private publicPlayers(): MatchPlayer[] {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, connected: p.connected, placed: p.placed.size, finishMs: p.finishMs, score: p.score }));
  }

  private phaseInfo(): PhaseInfo {
    return { phase: this.phase, endsAt: this.endsAt, roundStartedAt: this.roundStartedAt, serverNow: Date.now(), round: this.roundNo };
  }

  private setPhase(phase: MatchPhase, durationMs: number, next: (() => void) | null): void {
    if (this.closed) return;
    this.phase = phase;
    this.endsAt = durationMs > 0 ? Date.now() + durationMs : 0;
    if (this.timer) clearTimeout(this.timer);
    this.timer = next
      ? setTimeout(() => {
          try {
            next();
          } catch (err) {
            log.error('match step failed', { matchId: this.id, error: errMessage(err) });
            this.close();
          }
        }, durationMs)
      : null;
    this.deps.io.to(this.channel).emit('match:phase', this.phaseInfo());
  }

  start(): void {
    for (const id of this.players.keys()) this.deps.socketOf(id)?.join(this.channel);
    log.info('match started', { matchId: this.id, mode: this.mode, difficulty: this.difficulty, players: this.players.size });
    this.startRound();
  }

  private setupFor(playerId: string): RoundSetup | null {
    const r = this.round;
    if (!r) return null;
    const spec = DIFFICULTY_SPECS[this.difficulty];
    return { round: r.number, seed: r.seed, cols: spec.cols, rows: spec.rows, photoUrl: this.deps.photos.issue(r.photo, playerId), attribution: r.photo.attribution };
  }

  private startRound(): void {
    this.roundNo++;
    const spec = DIFFICULTY_SPECS[this.difficulty];
    const photo = this.deps.photos.pick(this.pack, this.usedPhotos, this.roomCode);
    this.usedPhotos.add(photo.id);
    const seed = randomSeed();
    const puzzle = generatePuzzle(seed, spec.cols, spec.rows);
    this.round = { number: this.roundNo, seed, photo, homes: puzzle.pieces.map((p) => p.home), total: puzzle.pieces.length };
    for (const p of this.players.values()) {
      p.placed = new Set();
      p.finishMs = null;
    }
    // Everyone gets the same seed (same cuts, same starting scatter) and their own picture URL.
    for (const id of this.players.keys()) {
      const setup = this.setupFor(id);
      if (setup) this.deps.socketOf(id)?.emit('round:setup', setup);
    }
    this.roundStartedAt = Date.now() + TIMINGS.countdownMs;
    this.setPhase('COUNTDOWN', TIMINGS.countdownMs, () => {
      this.roundStartedAt = Date.now();
      this.setPhase('SOLVING', spec.timeLimitMs, () => this.timeUp());
    });
  }

  place(playerId: string, input: PlaceInput): void {
    const p = this.players.get(playerId);
    const r = this.round;
    const sock = this.deps.socketOf(playerId);
    const ack = (ok: boolean): void => void sock?.emit('piece:ack', { round: input.round, index: input.index, ok });
    if (!p || !r || this.phase !== 'SOLVING' || input.round !== r.number || p.finishMs !== null) return;
    if (input.index >= r.total || p.placed.has(input.index)) return;
    const now = Date.now();
    if (now - p.lastPlaceAt < MIN_PLACE_INTERVAL_MS) return ack(false);
    const home = r.homes[input.index];
    if (Math.hypot(input.x - home.x, input.y - home.y) > SERVER_PLACE_TOLERANCE) return ack(false);
    p.lastPlaceAt = now;
    p.placed.add(input.index);
    ack(true);
    if (p.placed.size === r.total) p.finishMs = now - this.roundStartedAt;
    this.deps.io.to(this.channel).emit('progress', { playerId, placed: p.placed.size, finishMs: p.finishMs });
    if (p.finishMs !== null) this.endRound('finished', playerId);
  }

  private timeUp(): void {
    // Nobody finished: most pieces placed takes the round; a tie is a draw.
    const ranked = [...this.players.values()].sort((a, b) => b.placed.size - a.placed.size);
    const winner = ranked.length > 1 && ranked[0].placed.size > ranked[1].placed.size ? ranked[0].id : null;
    this.endRound('time', winner);
  }

  private endRound(reason: RoundResult['reason'], winnerId: string | null): void {
    const r = this.round;
    if (!r || this.phase !== 'SOLVING') return;
    const newBest: string[] = [];
    for (const p of this.players.values()) {
      if (p.finishMs !== null && this.deps.store.recordSolve(p.id, this.difficulty, p.finishMs, r.photo.id, this.mode)) newBest.push(p.id);
    }
    const winner = winnerId ? this.players.get(winnerId) : undefined;
    if (winner && this.mode !== 'solo') winner.score++;
    const result: RoundResult = {
      round: r.number,
      winnerId,
      reason,
      finishMs: Object.fromEntries([...this.players.values()].map((p) => [p.id, p.finishMs])),
      placed: Object.fromEntries([...this.players.values()].map((p) => [p.id, p.placed.size])),
      total: r.total,
      newBest,
    };
    this.results.push(result);
    this.deps.io.to(this.channel).emit('round:result', result);
    for (const id of this.players.keys()) {
      const profile = this.deps.store.profile(id);
      if (profile && newBest.includes(id)) this.deps.socketOf(id)?.emit('session:profile', profile);
    }

    const leader = [...this.players.values()].sort((a, b) => b.score - a.score)[0];
    const done = this.mode === 'solo' || leader.score >= this.winsNeeded || this.roundNo >= this.bestOf + 2;
    this.setPhase('ROUND_END', TIMINGS.roundEndMs, () => (done ? this.finish(false) : this.startRound()));
  }

  private finish(forfeit: boolean, forfeitWinner?: string): void {
    if (this.phase === 'MATCH_END') return;
    const list = [...this.players.values()];
    let winnerId: string | null = forfeitWinner ?? null;
    if (!forfeit && this.mode !== 'solo') {
      const [a, b] = [...list].sort((x, y) => y.score - x.score);
      winnerId = b && a.score === b.score ? null : a.id;
    }
    if (this.mode !== 'solo' && winnerId && list.length === 2) {
      const loser = list.find((p) => p.id !== winnerId);
      if (loser) this.deps.store.recordResult(winnerId, loser.id);
    }
    this.result = { winnerId, forfeit, rounds: [...this.results], scores: Object.fromEntries(list.map((p) => [p.id, p.score])) };
    this.deps.io.to(this.channel).emit('match:result', this.result);
    for (const id of this.players.keys()) {
      const profile = this.deps.store.profile(id);
      if (profile) this.deps.socketOf(id)?.emit('session:profile', profile);
    }
    this.setPhase('MATCH_END', TIMINGS.resultLingerMs, () => this.close());
  }

  attach(playerId: string, sock: Sock): void {
    const p = this.players.get(playerId);
    if (!p || this.closed) return;
    void sock.join(this.channel);
    if (!p.connected && !p.left) {
      p.connected = true;
      if (p.dcTimer) clearTimeout(p.dcTimer);
      p.dcTimer = null;
      this.deps.io.to(this.channel).emit('player:status', { playerId, connected: true });
    }
    sock.emit('match:snapshot', this.snapshotFor(playerId));
  }

  handleDisconnect(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || !p.connected) return;
    p.connected = false;
    this.deps.io.to(this.channel).emit('player:status', { playerId, connected: false });
    if (this.isOver()) {
      this.rematchVotes.delete(playerId);
      return;
    }
    p.dcTimer = setTimeout(() => this.abandon(playerId), TIMINGS.reconnectMs);
  }

  /** A player left for good (explicitly, or never came back): the opponent wins by forfeit. */
  abandon(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || this.closed) return;
    p.left = true;
    p.connected = false;
    if (p.dcTimer) clearTimeout(p.dcTimer);
    void this.deps.socketOf(playerId)?.leave(this.channel);
    if (this.isOver()) {
      if ([...this.players.values()].every((x) => !x.connected)) this.close();
      return;
    }
    if (this.mode === 'solo') return this.close();
    const other = [...this.players.values()].find((x) => x.id !== playerId && !x.left);
    if (!other) return this.close();
    this.deps.io.to(this.channel).emit('player:status', { playerId, connected: false });
    this.finish(true, other.id);
  }

  voteRematch(playerId: string): string | null {
    if (this.phase !== 'MATCH_END' || !this.players.has(playerId)) return 'Rematch is available after the match';
    this.rematchVotes.add(playerId);
    this.deps.io.to(this.channel).emit('match:rematch', { votes: [...this.rematchVotes] });
    const everyone = [...this.players.values()].every((p) => this.rematchVotes.has(p.id));
    if (everyone) this.deps.onRematch(this);
    return null;
  }

  snapshotFor(playerId: string): MatchSnapshot {
    return {
      ...this.phaseInfo(),
      matchId: this.id,
      mode: this.mode,
      difficulty: this.difficulty,
      bestOf: this.bestOf,
      pack: this.pack,
      players: this.publicPlayers(),
      setup: this.phase === 'MATCH_END' ? null : this.setupFor(playerId),
      myPlaced: [...(this.players.get(playerId)?.placed ?? [])],
      lastRound: this.results[this.results.length - 1] ?? null,
      result: this.result,
      rematchVotes: [...this.rematchVotes],
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    for (const p of this.players.values()) if (p.dcTimer) clearTimeout(p.dcTimer);
    this.deps.io.to(this.channel).emit('match:closed', { matchId: this.id });
    this.deps.io.socketsLeave(this.channel);
    this.deps.onClosed(this);
  }
}
