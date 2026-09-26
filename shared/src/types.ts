import type { BestOf, Difficulty, PicturePack } from './constants';

export type Ack<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export interface PlayerProfile {
  id: string;
  name: string;
  wins: number;
  losses: number;
  bestTimes: Partial<Record<Difficulty, number>>;
}

export type MatchMode = 'friend' | 'quick' | 'solo';
export type MatchPhase = 'COUNTDOWN' | 'SOLVING' | 'ROUND_END' | 'MATCH_END';

export interface MatchPlayer {
  id: string;
  name: string;
  connected: boolean;
  /** Pieces placed in the current round. */
  placed: number;
  /** ms from round start to finish, null while still solving. */
  finishMs: number | null;
  score: number;
}

export interface Attribution {
  title: string;
  author: string | null;
  sourceUrl: string | null;
  license: string;
  licenseUrl: string | null;
}

export interface RoundSetup {
  round: number;
  seed: number;
  cols: number;
  rows: number;
  /** One-time URL for the round's picture. */
  photoUrl: string;
  attribution: Attribution;
}

export interface PhaseInfo {
  phase: MatchPhase;
  /** Server timestamp when the phase ends (0 = open-ended). */
  endsAt: number;
  /** Server timestamp when solving started for the current round. */
  roundStartedAt: number;
  serverNow: number;
  round: number;
}

export interface RoundResult {
  round: number;
  winnerId: string | null;
  reason: 'finished' | 'time' | 'forfeit';
  finishMs: Record<string, number | null>;
  placed: Record<string, number>;
  total: number;
  newBest: string[];
}

export interface MatchResult {
  winnerId: string | null;
  forfeit: boolean;
  rounds: RoundResult[];
  scores: Record<string, number>;
}

export interface MatchSnapshot extends PhaseInfo {
  matchId: string;
  mode: MatchMode;
  difficulty: Difficulty;
  bestOf: BestOf;
  pack: PicturePack;
  players: MatchPlayer[];
  setup: RoundSetup | null;
  /** Pieces this client has already placed this round (for reconnects). */
  myPlaced: number[];
  lastRound: RoundResult | null;
  result: MatchResult | null;
  rematchVotes: string[];
}

export interface RoomState {
  code: string;
  hostId: string;
  difficulty: Difficulty;
  bestOf: BestOf;
  pack: PicturePack;
  uploads: number;
  players: Array<{ id: string; name: string; connected: boolean }>;
  matchId: string | null;
}

export interface QueueState {
  searching: boolean;
  difficulty: Difficulty | null;
  since: number;
}

export interface Notice {
  kind: 'info' | 'error';
  message: string;
}

export interface BestTimeEntry {
  position: number;
  name: string;
  ms: number;
  at: number;
}
