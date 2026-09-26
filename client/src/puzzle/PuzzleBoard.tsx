import { useEffect, useRef } from 'react';
import {
  BOARD_H,
  BOARD_W,
  LAYOUTS,
  SNAP_DISTANCE,
  generatePuzzle,
  piecePathData,
  scatterPieces,
  type BoardAssist,
  type Layout,
  type Point,
  type Puzzle,
  type RoundSetup,
} from '@pc/shared';
import { buzz, sound } from '../lib/sound';
import { getSocket } from '../net/socket';

interface Props {
  setup: RoundSetup;
  picture: string | null;
  assist: BoardAssist;
  active: boolean;
  restorePlaced: number[];
  /** Show the whole picture over the board (hold-to-peek). */
  peek: boolean;
  /** Incrementing this re-sorts loose pieces with edge pieces first. */
  gatherSignal: number;
}

interface Drag {
  index: number;
  pointerId: number;
  dx: number;
  dy: number;
}

/** Mutable board state kept outside React so dragging never re-renders components. */
interface BoardState {
  puzzle: Puzzle;
  layout: Layout;
  pos: Point[];
  order: number[];
  locked: Set<number>;
  pending: Set<number>;
  paths: Path2D[];
  bitmaps: HTMLCanvasElement[];
  bitmapScale: number;
  img: HTMLImageElement | null;
  drag: Drag | null;
}

const PIECE_OUTLINE = 'rgba(31, 42, 68, 0.55)';

export function PuzzleBoard({ setup, picture, assist, active, restorePlaced, peek, gatherSignal }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef<BoardState | null>(null);
  const frame = useRef(0);
  const live = useRef({ active, peek, assist, round: setup.round });
  live.current = { active, peek, assist, round: setup.round };

  const scale = () => {
    const c = canvasRef.current;
    const st = state.current;
    return c && st ? c.width / st.layout.width : 1;
  };

  const draw = () => {
    frame.current = 0;
    const c = canvasRef.current;
    const st = state.current;
    if (!c || !st) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const s = scale();
    const { puzzle, layout, pos } = st;
    const bx = layout.board.x * s;
    const by = layout.board.y * s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);

    // Board: a recessed tray where the finished picture goes.
    ctx.fillStyle = '#EDE4D3';
    ctx.strokeStyle = 'rgba(31,42,68,0.18)';
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.beginPath();
    ctx.roundRect(bx - 6 * s, by - 6 * s, (BOARD_W + 12) * s, (BOARD_H + 12) * s, 10 * s);
    ctx.fill();
    ctx.stroke();
    if (st.img && live.current.assist === 'ghost') {
      ctx.globalAlpha = 0.2;
      ctx.drawImage(st.img, bx, by, BOARD_W * s, BOARD_H * s);
      ctx.globalAlpha = 1;
    }
    if (live.current.assist === 'outline') {
      ctx.save();
      ctx.setTransform(s, 0, 0, s, bx, by);
      ctx.strokeStyle = 'rgba(31,42,68,0.14)';
      ctx.lineWidth = 1.2;
      for (const p of puzzle.pieces) {
        ctx.save();
        ctx.translate(p.home.x, p.home.y);
        ctx.stroke(st.paths[p.index]);
        ctx.restore();
      }
      ctx.restore();
    }

    const drawPiece = (i: number, shadow: 'none' | 'rest' | 'lift') => {
      const bmp = st.bitmaps[i];
      if (!bmp) return;
      const x = (pos[i].x - puzzle.pad) * s;
      const y = (pos[i].y - puzzle.pad) * s;
      const w = (puzzle.pieceW + puzzle.pad * 2) * s;
      const h = (puzzle.pieceH + puzzle.pad * 2) * s;
      if (shadow !== 'none') {
        ctx.shadowColor = shadow === 'lift' ? 'rgba(31,42,68,0.35)' : 'rgba(31,42,68,0.22)';
        ctx.shadowBlur = (shadow === 'lift' ? 18 : 5) * s;
        ctx.shadowOffsetY = (shadow === 'lift' ? 8 : 2) * s;
      }
      ctx.drawImage(bmp, x, y, w, h);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    };

    for (const i of st.order) if (st.locked.has(i)) drawPiece(i, 'none');
    for (const i of st.order) if (!st.locked.has(i) && st.drag?.index !== i) drawPiece(i, 'rest');
    if (st.drag) drawPiece(st.drag.index, 'lift');

    if (st.img && live.current.peek) {
      ctx.globalAlpha = 0.92;
      ctx.drawImage(st.img, bx, by, BOARD_W * s, BOARD_H * s);
      ctx.globalAlpha = 1;
    }
  };

  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  };

  const buildBitmaps = () => {
    const st = state.current;
    if (!st?.img) return;
    const s = scale();
    const { puzzle } = st;
    st.bitmaps = puzzle.pieces.map((p) => {
      const c = document.createElement('canvas');
      c.width = Math.ceil((puzzle.pieceW + puzzle.pad * 2) * s);
      c.height = Math.ceil((puzzle.pieceH + puzzle.pad * 2) * s);
      const ctx = c.getContext('2d') as CanvasRenderingContext2D;
      ctx.scale(s, s);
      ctx.translate(puzzle.pad, puzzle.pad);
      const path = st.paths[p.index];
      ctx.save();
      ctx.clip(path);
      ctx.drawImage(st.img as HTMLImageElement, -p.home.x, -p.home.y, BOARD_W, BOARD_H);
      ctx.restore();
      ctx.strokeStyle = PIECE_OUTLINE;
      ctx.lineWidth = 1.2;
      ctx.stroke(path);
      // Soft top-left highlight gives the cardboard a little depth.
      ctx.save();
      ctx.clip(path);
      ctx.translate(-1.2, -1.2);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.4;
      ctx.stroke(path);
      ctx.restore();
      return c;
    });
    st.bitmapScale = s;
    schedule();
  };

  const pickLayout = (): Layout => {
    const box = wrapRef.current?.getBoundingClientRect();
    return box && box.height > box.width * 1.05 ? LAYOUTS.portrait : LAYOUTS.landscape;
  };

  // New round (or reconnect): cut the puzzle and tip the pieces out.
  useEffect(() => {
    const puzzle = generatePuzzle(setup.seed, setup.cols, setup.rows);
    const layout = pickLayout();
    const pos = scatterPieces(puzzle, layout, setup.seed);
    const locked = new Set(restorePlaced);
    for (const i of locked) pos[i] = { x: layout.board.x + puzzle.pieces[i].home.x, y: layout.board.y + puzzle.pieces[i].home.y };
    state.current = {
      puzzle,
      layout,
      pos,
      order: puzzle.pieces.map((p) => p.index),
      locked,
      pending: new Set(),
      paths: puzzle.pieces.map((p) => new Path2D(piecePathData(p))),
      bitmaps: [],
      bitmapScale: 0,
      img: null,
      drag: null,
    };
    fit();
    schedule();
    // restorePlaced only matters when the round (seed) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.seed, setup.round]);

  // Picture arrives (object URL): decode it, then cut the piece bitmaps.
  useEffect(() => {
    if (!picture) return;
    const img = new Image();
    img.onload = () => {
      if (!state.current) return;
      state.current.img = img;
      buildBitmaps();
    };
    img.src = picture;
    // buildBitmaps reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picture, setup.seed]);

  const fit = () => {
    const c = canvasRef.current;
    const wrap = wrapRef.current;
    const st = state.current;
    if (!c || !wrap || !st) return;
    const box = wrap.getBoundingClientRect();
    const wanted = pickLayout();
    if (wanted.name !== st.layout.name) {
      // Orientation changed: keep placed pieces on the board, re-tip the loose ones into the new trays.
      const fresh = scatterPieces(st.puzzle, wanted, setup.seed);
      st.pos = st.pos.map((p, i) =>
        st.locked.has(i) ? { x: wanted.board.x + st.puzzle.pieces[i].home.x, y: wanted.board.y + st.puzzle.pieces[i].home.y } : fresh[i],
      );
      st.layout = wanted;
    }
    const cssW = Math.min(box.width, (box.height * st.layout.width) / st.layout.height);
    const cssH = (cssW * st.layout.height) / st.layout.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    if (st.img && Math.abs(scale() - st.bitmapScale) > 0.01) buildBitmaps();
    schedule();
  };

  useEffect(() => {
    const ro = new ResizeObserver(() => fit());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
    // fit reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(schedule, [peek, assist]);

  // Edge pieces to the front of the trays.
  useEffect(() => {
    const st = state.current;
    if (!gatherSignal || !st) return;
    const slots = scatterPieces(st.puzzle, st.layout, setup.seed);
    const loose = st.puzzle.pieces.filter((p) => !st.locked.has(p.index));
    const freeSlots = loose.map((p) => slots[p.index]).sort((a, b) => a.y - b.y || a.x - b.x);
    const sorted = [...loose].sort((a, b) => Number(b.isEdge) - Number(a.isEdge));
    sorted.forEach((p, i) => (st.pos[p.index] = freeSlots[i]));
    st.order = [...st.order.filter((i) => st.locked.has(i)), ...sorted.map((p) => p.index).reverse()];
    schedule();
    // Runs only when the button is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatherSignal]);

  // Server verdicts on our placements.
  useEffect(() => {
    const sock = getSocket();
    if (!sock) return;
    const onAck = ({ round, index, ok }: { round: number; index: number; ok: boolean }) => {
      const st = state.current;
      if (!st || round !== live.current.round) return;
      st.pending.delete(index);
      if (!ok) {
        st.locked.delete(index);
        const tray = st.layout.trays[0];
        st.pos[index] = { x: tray.x + tray.w / 2 - st.puzzle.pieceW / 2, y: tray.y + 20 };
        schedule();
      }
    };
    sock.on('piece:ack', onAck);
    return () => {
      sock.off('piece:ack', onAck);
    };
    // schedule reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pointer input: pick the top-most loose piece under the pointer, drag, snap near its slot.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const hit = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;

    const toLogical = (e: PointerEvent): Point => {
      const st = state.current as BoardState;
      const r = c.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * st.layout.width, y: ((e.clientY - r.top) / r.height) * st.layout.height };
    };

    const down = (e: PointerEvent) => {
      const st = state.current;
      if (!st || !live.current.active || st.drag || !st.img) return;
      const p = toLogical(e);
      for (let k = st.order.length - 1; k >= 0; k--) {
        const i = st.order[k];
        if (st.locked.has(i)) continue;
        const lx = p.x - st.pos[i].x;
        const ly = p.y - st.pos[i].y;
        const pad = st.puzzle.pad;
        if (lx < -pad || ly < -pad || lx > st.puzzle.pieceW + pad || ly > st.puzzle.pieceH + pad) continue;
        if (!hit.isPointInPath(st.paths[i], lx, ly)) continue;
        e.preventDefault();
        c.setPointerCapture(e.pointerId);
        st.drag = { index: i, pointerId: e.pointerId, dx: lx, dy: ly };
        st.order = [...st.order.filter((x) => x !== i), i];
        sound.pick();
        schedule();
        return;
      }
    };

    const move = (e: PointerEvent) => {
      const st = state.current;
      if (!st?.drag || e.pointerId !== st.drag.pointerId) return;
      const p = toLogical(e);
      const { pieceW, pieceH } = st.puzzle;
      st.pos[st.drag.index] = {
        x: Math.max(-pieceW / 2, Math.min(st.layout.width - pieceW / 2, p.x - st.drag.dx)),
        y: Math.max(-pieceH / 2, Math.min(st.layout.height - pieceH / 2, p.y - st.drag.dy)),
      };
      schedule();
    };

    const up = (e: PointerEvent) => {
      const st = state.current;
      if (!st?.drag || e.pointerId !== st.drag.pointerId) return;
      const i = st.drag.index;
      st.drag = null;
      const home = st.puzzle.pieces[i].home;
      const bx = st.pos[i].x - st.layout.board.x;
      const by = st.pos[i].y - st.layout.board.y;
      if (live.current.active && Math.hypot(bx - home.x, by - home.y) <= SNAP_DISTANCE) {
        st.pos[i] = { x: st.layout.board.x + home.x, y: st.layout.board.y + home.y };
        st.locked.add(i);
        st.pending.add(i);
        getSocket()?.emit('piece:place', { round: live.current.round, index: i, x: bx, y: by });
        sound.snap();
        buzz(12);
      }
      schedule();
    };

    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
    };
    // Handlers read refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapRef} className="flex h-full w-full items-start justify-center">
      <canvas ref={canvasRef} className="touch-none select-none" role="application" aria-label="Jigsaw board. Drag pieces onto the board; they snap in when close to their spot." />
    </div>
  );
}
