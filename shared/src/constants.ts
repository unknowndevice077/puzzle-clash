export const GAME_NAME = 'Puzzle Clash';

/** Logical size of the finished puzzle. Piece geometry and placements live in this space. */
export const BOARD_W = 800;
export const BOARD_H = 600;

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** What the empty board shows while solving. */
export type BoardAssist = 'ghost' | 'outline' | 'none';

export interface DifficultySpec {
  label: string;
  cols: number;
  rows: number;
  timeLimitMs: number;
  assist: BoardAssist;
}

export const DIFFICULTY_SPECS: Record<Difficulty, DifficultySpec> = {
  easy: { label: 'Easy', cols: 4, rows: 3, timeLimitMs: 3 * 60_000, assist: 'ghost' },
  medium: { label: 'Medium', cols: 5, rows: 4, timeLimitMs: 5 * 60_000, assist: 'outline' },
  hard: { label: 'Hard', cols: 7, rows: 5, timeLimitMs: 7 * 60_000, assist: 'none' },
};

/** Picture packs. "custom" = pictures the room host uploaded (friend rooms only). */
export const PICTURE_PACKS = ['ghibli', 'photos', 'custom'] as const;
export type PicturePack = (typeof PICTURE_PACKS)[number];
export const PACK_LABELS: Record<PicturePack, string> = {
  ghibli: 'Studio Ghibli',
  photos: 'Nature & places',
  custom: 'Our own pictures',
};
export const MAX_UPLOADS_PER_ROOM = 40;
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

export const BEST_OF_OPTIONS = [1, 3, 5] as const;
export type BestOf = (typeof BEST_OF_OPTIONS)[number];

/** Client snaps a piece when dropped this close (logical px) to its slot. */
export const SNAP_DISTANCE = 30;
/** Server accepts a placement within this distance; slightly looser to absorb rounding. */
export const SERVER_PLACE_TOLERANCE = 44;
/** Placements faster than this (per player) are ignored as automation. */
export const MIN_PLACE_INTERVAL_MS = 120;

export const TIMINGS = {
  countdownMs: 3500,
  roundEndMs: 6500,
  reconnectMs: 30_000,
  resultLingerMs: 120_000,
};

export const NAME_MIN = 2;
export const NAME_MAX = 16;

/**
 * Playfield layouts. The board sits inside a larger table; loose pieces start in the tray areas.
 * Portrait suits phones, landscape suits tablets and desktops.
 */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  name: 'portrait' | 'landscape';
  width: number;
  height: number;
  board: { x: number; y: number };
  trays: Area[];
}

export const LAYOUTS: Record<Layout['name'], Layout> = {
  portrait: {
    name: 'portrait',
    width: 1000,
    // Tall enough to match a phone screen, so loose pieces can spread out below the board.
    height: 1600,
    board: { x: 100, y: 40 },
    trays: [{ x: 10, y: 700, w: 980, h: 890 }],
  },
  landscape: {
    name: 'landscape',
    width: 1640,
    height: 860,
    board: { x: 420, y: 130 },
    trays: [
      { x: 10, y: 10, w: 400, h: 840 },
      { x: 1230, y: 10, w: 400, h: 840 },
    ],
  },
};
