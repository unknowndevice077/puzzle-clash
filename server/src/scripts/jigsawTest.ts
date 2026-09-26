/**
 * Sanity checks for the jigsaw generator:
 *  1. Same seed -> identical pieces (determinism, so both players get the same puzzle).
 *  2. Every internal edge is traced by both neighbours and the two traces coincide (pieces interlock).
 *  3. Tabs stay inside the padding the renderer reserves.
 * Optionally writes an SVG preview: npm run test:jigsaw -- --svg out.svg
 */
import fs from 'node:fs';
import { DIFFICULTY_SPECS, generatePuzzle, piecePathData, type PieceShape, type Point, type Puzzle } from '@pc/shared';

function outlinePoints(p: PieceShape): Point[] {
  return [p.start, ...p.segs.map((s) => ({ x: s.x, y: s.y }))].map((q) => ({ x: q.x + p.home.x, y: q.y + p.home.y }));
}

function allCoords(p: PieceShape): Point[] {
  return p.segs.flatMap((s) => (s.t === 'L' ? [{ x: s.x, y: s.y }] : [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }, { x: s.x, y: s.y }]));
}

const key = (q: Point) => `${Math.round(q.x * 10)},${Math.round(q.y * 10)}`;

function check(puzzle: Puzzle): string[] {
  const errors: string[] = [];
  const sets = puzzle.pieces.map((p) => new Set(outlinePoints(p).map(key)));
  for (const p of puzzle.pieces) {
    const right = puzzle.pieces.find((q) => q.row === p.row && q.col === p.col + 1);
    const below = puzzle.pieces.find((q) => q.col === p.col && q.row === p.row + 1);
    for (const n of [right, below]) {
      if (!n) continue;
      const shared = [...sets[p.index]].filter((k) => sets[n.index].has(k)).length;
      // A knob edge has 7 points (start/end corners + 5 curve points); both pieces must contain all of them.
      if (shared < 7) errors.push(`pieces ${p.index} and ${n.index} share only ${shared} outline points`);
    }
    for (const c of allCoords(p)) {
      if (c.x < -puzzle.pad || c.y < -puzzle.pad || c.x > puzzle.pieceW + puzzle.pad || c.y > puzzle.pieceH + puzzle.pad) {
        errors.push(`piece ${p.index} extends beyond its padding`);
        break;
      }
    }
  }
  return errors;
}

let failures = 0;
for (const [name, spec] of Object.entries(DIFFICULTY_SPECS)) {
  for (const seed of [1, 42, 123456, 987654321]) {
    const a = generatePuzzle(seed, spec.cols, spec.rows);
    const b = generatePuzzle(seed, spec.cols, spec.rows);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      failures++;
      console.log(`FAIL ${name} seed ${seed}: not deterministic`);
    }
    const errs = check(a);
    if (errs.length) {
      failures++;
      console.log(`FAIL ${name} seed ${seed}: ${errs.slice(0, 3).join('; ')}`);
    }
  }
  console.log(`${name.padEnd(7)} ${spec.cols}x${spec.rows}: checked`);
}

const svgIdx = process.argv.indexOf('--svg');
if (svgIdx > 0) {
  const p = generatePuzzle(42, 5, 4);
  const colors = ['#E4572E', '#29A19C', '#F3A712', '#6D597A', '#3A86FF'];
  const assembled = p.pieces.map((pc, i) => `<path d="${piecePathData(pc, pc.home.x + 20, pc.home.y + 20)}" fill="${colors[i % colors.length]}" stroke="#1F2A44" stroke-width="2"/>`).join('');
  const exploded = p.pieces
    .map((pc, i) => `<path d="${piecePathData(pc, pc.home.x * 1.25 + 880, pc.home.y * 1.25 + 20)}" fill="${colors[i % colors.length]}" stroke="#1F2A44" stroke-width="2"/>`)
    .join('');
  fs.writeFileSync(process.argv[svgIdx + 1], `<svg xmlns="http://www.w3.org/2000/svg" width="1960" height="800" style="background:#F5EFE6">${assembled}${exploded}</svg>`);
  console.log('preview written');
}

console.log(failures ? `${failures} check(s) failed` : 'All jigsaw checks passed');
process.exit(failures ? 1 : 0);
