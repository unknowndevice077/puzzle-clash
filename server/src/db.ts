import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DIFFICULTIES, type BestTimeEntry, type Difficulty, type PlayerProfile } from '@pc/shared';
import { config } from './config';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  wins        INTEGER NOT NULL DEFAULT 0,
  losses      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS solves (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  difficulty  TEXT NOT NULL,
  ms          INTEGER NOT NULL,
  photo_id    TEXT NOT NULL,
  mode        TEXT NOT NULL,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_solves_diff_ms ON solves(difficulty, ms);
CREATE INDEX IF NOT EXISTS idx_solves_player ON solves(player_id, difficulty);
`;

interface PlayerRow {
  id: string;
  name: string;
  token_hash: string;
  wins: number;
  losses: number;
}

export class Store {
  private readonly db: Database.Database;

  constructor(file = path.join(config.dataDir, 'puzzleclash.sqlite')) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  byToken(hash: string): PlayerRow | undefined {
    return this.db.prepare('SELECT * FROM players WHERE token_hash = ?').get(hash) as PlayerRow | undefined;
  }

  byId(id: string): PlayerRow | undefined {
    return this.db.prepare('SELECT * FROM players WHERE id = ?').get(id) as PlayerRow | undefined;
  }

  create(id: string, name: string, tokenHash: string): void {
    const now = Date.now();
    this.db.prepare('INSERT INTO players (id, name, token_hash, created_at, last_seen) VALUES (?, ?, ?, ?, ?)').run(id, name, tokenHash, now, now);
  }

  rename(id: string, name: string): void {
    this.db.prepare('UPDATE players SET name = ?, last_seen = ? WHERE id = ?').run(name, Date.now(), id);
  }

  touch(id: string): void {
    this.db.prepare('UPDATE players SET last_seen = ? WHERE id = ?').run(Date.now(), id);
  }

  recordResult(winnerId: string, loserId: string): void {
    this.db.transaction(() => {
      this.db.prepare('UPDATE players SET wins = wins + 1 WHERE id = ?').run(winnerId);
      this.db.prepare('UPDATE players SET losses = losses + 1 WHERE id = ?').run(loserId);
    })();
  }

  bestTime(playerId: string, difficulty: Difficulty): number | null {
    const r = this.db.prepare('SELECT MIN(ms) AS ms FROM solves WHERE player_id = ? AND difficulty = ?').get(playerId, difficulty) as { ms: number | null };
    return r.ms;
  }

  /** Stores a completed solve; returns true if it beat the player's previous best. */
  recordSolve(playerId: string, difficulty: Difficulty, ms: number, photoId: string, mode: string): boolean {
    const prev = this.bestTime(playerId, difficulty);
    this.db.prepare('INSERT INTO solves (player_id, difficulty, ms, photo_id, mode, at) VALUES (?, ?, ?, ?, ?, ?)').run(playerId, difficulty, ms, photoId, mode, Date.now());
    return prev === null || ms < prev;
  }

  profile(id: string): PlayerProfile | null {
    const row = this.byId(id);
    if (!row) return null;
    const bestTimes: PlayerProfile['bestTimes'] = {};
    for (const d of DIFFICULTIES) {
      const ms = this.bestTime(id, d);
      if (ms !== null) bestTimes[d] = ms;
    }
    return { id: row.id, name: row.name, wins: row.wins, losses: row.losses, bestTimes };
  }

  leaderboard(difficulty: Difficulty, limit = 20): BestTimeEntry[] {
    const rows = this.db
      .prepare(
        `SELECT p.name, MIN(s.ms) AS ms, MIN(s.at) AS at FROM solves s JOIN players p ON p.id = s.player_id
         WHERE s.difficulty = ? GROUP BY s.player_id ORDER BY ms ASC LIMIT ?`,
      )
      .all(difficulty, limit) as Array<{ name: string; ms: number; at: number }>;
    return rows.map((r, i) => ({ position: i + 1, name: r.name, ms: r.ms, at: r.at }));
  }
}
