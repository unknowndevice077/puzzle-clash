/**
 * Deterministic jigsaw generation. Given (seed, cols, rows) every client and the server
 * compute identical piece outlines, so shared edges always interlock exactly.
 */
import { BOARD_H, BOARD_W, type Area, type Layout } from './constants';

export interface Point {
  x: number;
  y: number;
}

export type Seg = { t: 'L'; x: number; y: number } | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number };

interface Edge {
  start: Point;
  segs: Seg[];
}

export interface PieceShape {
  index: number;
  col: number;
  row: number;
  /** Where the piece's top-left cell corner belongs, in board coordinates. */
  home: Point;
  /** Outline in piece-local coordinates (origin = cell top-left; tabs may go negative). */
  start: Point;
  segs: Seg[];
  isEdge: boolean;
}

export interface Puzzle {
  cols: number;
  rows: number;
  pieceW: number;
  pieceH: number;
  /** Margin around a cell that tabs can reach into. */
  pad: number;
  pieces: PieceShape[];
}

/** Small, fast, seedable PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Classic knob in edge-local units: u runs 0..1 along the edge, v is the outward bulge (x edge length).
const KNOB: Array<[number, number, number, number, number, number]> = [
  [0.4, 0.0, 0.37, 0.12, 0.36, 0.17],
  [0.33, 0.28, 0.42, 0.33, 0.5, 0.33],
  [0.58, 0.33, 0.67, 0.28, 0.64, 0.17],
  [0.63, 0.12, 0.6, 0.0, 0.66, 0.0],
];

/** Builds one interlocking edge from a to b, bulging towards `dir` (unit normal) scaled by `sign`. */
function buildEdge(a: Point, b: Point, normal: Point, sign: number, shift: number, depth: number): Edge {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const at = (u: number, v: number): Point => ({
    x: a.x + dx * (u + shift) + normal.x * v * len * sign * depth,
    y: a.y + dy * (u + shift) + normal.y * v * len * sign * depth,
  });
  const segs: Seg[] = [];
  const p0 = at(0.34, 0);
  segs.push({ t: 'L', x: p0.x, y: p0.y });
  for (const [u1, v1, u2, v2, u, v] of KNOB) {
    const c1 = at(u1, v1);
    const c2 = at(u2, v2);
    const p = at(u, v);
    segs.push({ t: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: p.x, y: p.y });
  }
  segs.push({ t: 'L', x: b.x, y: b.y });
  return { start: a, segs };
}

function straight(a: Point, b: Point): Edge {
  return { start: a, segs: [{ t: 'L', x: b.x, y: b.y }] };
}

function endOf(e: Edge): Point {
  const last = e.segs[e.segs.length - 1];
  return { x: last.x, y: last.y };
}

/** Same edge traversed in the opposite direction (bezier control points swap). */
function reverse(e: Edge): Edge {
  const pts: Point[] = [e.start, ...e.segs.map((s) => ({ x: s.x, y: s.y }))];
  const segs: Seg[] = [];
  for (let i = e.segs.length - 1; i >= 0; i--) {
    const s = e.segs[i];
    const to = pts[i];
    segs.push(s.t === 'L' ? { t: 'L', x: to.x, y: to.y } : { t: 'C', x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1, x: to.x, y: to.y });
  }
  return { start: endOf(e), segs };
}

export function generatePuzzle(seed: number, cols: number, rows: number): Puzzle {
  const rand = rng(seed);
  const pw = BOARD_W / cols;
  const ph = BOARD_H / rows;
  const depth = 0.9 + rand() * 0.2;
  const pad = Math.ceil(Math.max(pw, ph) * 0.36 * depth);
  const knob = () => ({ sign: rand() < 0.5 ? 1 : -1, shift: (rand() - 0.5) * 0.08 });

  // Horizontal edges between row r and r+1 (index [r][c]) run left -> right and bulge down when sign = 1.
  const hEdges: Edge[][] = [];
  for (let r = 0; r < rows - 1; r++) {
    hEdges.push([]);
    for (let c = 0; c < cols; c++) {
      const k = knob();
      const y = (r + 1) * ph;
      hEdges[r].push(buildEdge({ x: c * pw, y }, { x: (c + 1) * pw, y }, { x: 0, y: 1 }, k.sign, k.shift, depth * (ph / pw > 1 ? pw / ph : 1)));
    }
  }
  // Vertical edges between col c and c+1 (index [r][c]) run top -> bottom and bulge right when sign = 1.
  const vEdges: Edge[][] = [];
  for (let r = 0; r < rows; r++) {
    vEdges.push([]);
    for (let c = 0; c < cols - 1; c++) {
      const k = knob();
      const x = (c + 1) * pw;
      vEdges[r].push(buildEdge({ x, y: r * ph }, { x, y: (r + 1) * ph }, { x: 1, y: 0 }, k.sign, k.shift, depth * (pw / ph > 1 ? ph / pw : 1)));
    }
  }

  const pieces: PieceShape[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = c * pw;
      const y0 = r * ph;
      const x1 = x0 + pw;
      const y1 = y0 + ph;
      // Clockwise: top, right, bottom, left.
      const edges: Edge[] = [
        r === 0 ? straight({ x: x0, y: y0 }, { x: x1, y: y0 }) : hEdges[r - 1][c],
        c === cols - 1 ? straight({ x: x1, y: y0 }, { x: x1, y: y1 }) : vEdges[r][c],
        r === rows - 1 ? straight({ x: x1, y: y1 }, { x: x0, y: y1 }) : reverse(hEdges[r][c]),
        c === 0 ? straight({ x: x0, y: y1 }, { x: x0, y: y0 }) : reverse(vEdges[r][c - 1]),
      ];
      const local = (p: Point): Point => ({ x: p.x - x0, y: p.y - y0 });
      const segs: Seg[] = edges.flatMap((e) =>
        e.segs.map((s): Seg => {
          if (s.t === 'L') return { t: 'L', ...local(s) };
          const c1 = local({ x: s.x1, y: s.y1 });
          const c2 = local({ x: s.x2, y: s.y2 });
          const p = local(s);
          return { t: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: p.x, y: p.y };
        }),
      );
      pieces.push({
        index: r * cols + c,
        col: c,
        row: r,
        home: { x: x0, y: y0 },
        start: { x: 0, y: 0 },
        segs,
        isEdge: r === 0 || c === 0 || r === rows - 1 || c === cols - 1,
      });
    }
  }
  return { cols, rows, pieceW: pw, pieceH: ph, pad, pieces };
}

/** SVG path data for a piece outline (piece-local coordinates, offset by `ox`, `oy`). */
export function piecePathData(piece: PieceShape, ox = 0, oy = 0): string {
  const f = (n: number) => Math.round(n * 100) / 100;
  let d = `M ${f(piece.start.x + ox)} ${f(piece.start.y + oy)}`;
  for (const s of piece.segs) {
    d += s.t === 'L' ? ` L ${f(s.x + ox)} ${f(s.y + oy)}` : ` C ${f(s.x1 + ox)} ${f(s.y1 + oy)} ${f(s.x2 + ox)} ${f(s.y2 + oy)} ${f(s.x + ox)} ${f(s.y + oy)}`;
  }
  return `${d} Z`;
}

/**
 * Deterministic starting positions for loose pieces inside the layout's tray areas
 * (top-left of the piece cell, in playfield coordinates). Same seed -> same scatter for both players.
 */
export function scatterPieces(puzzle: Puzzle, layout: Layout, seed: number): Point[] {
  const rand = rng(seed ^ 0x9e3779b9);
  const order = puzzle.pieces.map((p) => p.index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const totalArea = layout.trays.reduce((s, a) => s + a.w * a.h, 0);
  const out: Point[] = new Array(puzzle.pieces.length);
  let cursor = 0;
  layout.trays.forEach((tray, ti) => {
    const share = ti === layout.trays.length - 1 ? order.length - cursor : Math.round((order.length * tray.w * tray.h) / totalArea);
    const slice = order.slice(cursor, cursor + share);
    cursor += share;
    placeInArea(slice, tray, puzzle, rand, out);
  });
  return out;
}

function placeInArea(indices: number[], area: Area, puzzle: Puzzle, rand: () => number, out: Point[]): void {
  if (!indices.length) return;
  const { pieceW: w, pieceH: h, pad } = puzzle;
  // Grid with jitter so pieces overlap a little, like a real tipped-out box, but stay grabbable.
  const aspect = area.w / area.h;
  const cols = Math.max(1, Math.round(Math.sqrt(indices.length * aspect)));
  const rows = Math.ceil(indices.length / cols);
  const cellW = area.w / cols;
  const cellH = area.h / rows;
  indices.forEach((idx, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const jx = (rand() - 0.5) * Math.max(0, cellW - w) * 0.8;
    const jy = (rand() - 0.5) * Math.max(0, cellH - h) * 0.8;
    const x = area.x + c * cellW + (cellW - w) / 2 + jx;
    const y = area.y + r * cellH + (cellH - h) / 2 + jy;
    out[idx] = {
      x: Math.min(area.x + area.w - w - pad * 0.3, Math.max(area.x + pad * 0.3, x)),
      y: Math.min(area.y + area.h - h - pad * 0.3, Math.max(area.y + pad * 0.3, y)),
    };
  });
}
