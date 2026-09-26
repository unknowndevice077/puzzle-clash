import { useId, useMemo } from 'react';
import { BOARD_H, BOARD_W, generatePuzzle, piecePathData } from '@pc/shared';

/** SVG ids from useId contain ':' which some browsers reject inside url(#…). */
const useSvgId = () => `j${useId().replace(/:/g, '')}`;

interface JigsawPictureProps {
  src: string | null;
  cols: number;
  rows: number;
  seed: number;
  /** Index of a piece shown lifted out of its slot, or null for a flat, finished puzzle. */
  lift?: number | null;
  className?: string;
  alt?: string;
}

/**
 * A picture cut with the game's own jigsaw generator, so the art matches the real pieces.
 * With `lift`, one piece floats above its empty slot.
 */
export function JigsawPicture({ src, cols, rows, seed, lift = null, className = '', alt = '' }: JigsawPictureProps) {
  const id = useSvgId();
  const puzzle = useMemo(() => generatePuzzle(seed, cols, rows), [seed, cols, rows]);
  const paths = useMemo(() => puzzle.pieces.map((p) => piecePathData(p, p.home.x, p.home.y)), [puzzle]);
  const lifted = lift === null ? null : puzzle.pieces[lift % puzzle.pieces.length];
  const liftedPath = lifted ? paths[lifted.index] : '';
  const cx = lifted ? lifted.home.x + puzzle.pieceW / 2 : 0;
  const cy = lifted ? lifted.home.y + puzzle.pieceH / 2 : 0;

  return (
    // Extra room above and to the right when a piece is lifted, so it can pop out past the frame.
    <svg
      viewBox={lifted ? `-24 -120 ${BOARD_W + 150} ${BOARD_H + 150}` : `-6 -6 ${BOARD_W + 12} ${BOARD_H + 12}`}
      className={className}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <defs>
        <clipPath id={`${id}-board`}>
          <rect width={BOARD_W} height={BOARD_H} rx="6" />
        </clipPath>
        {lifted && (
          <clipPath id={`${id}-piece`}>
            <path d={liftedPath} />
          </clipPath>
        )}
        <filter id={`${id}-shadow`} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="10" dy="22" stdDeviation="12" floodColor="#1F2A44" floodOpacity="0.5" />
        </filter>
      </defs>

      <g clipPath={`url(#${id}-board)`}>
        {src ? <image href={src} width={BOARD_W} height={BOARD_H} preserveAspectRatio="xMidYMid slice" /> : <rect width={BOARD_W} height={BOARD_H} fill="#D3BD94" />}
        {/* Cut lines: a dark groove with a light lip reads as pressed cardboard. */}
        <g fill="none" strokeLinejoin="round">
          {paths.map((d, i) => (
            <path key={`s${i}`} d={d} stroke="rgba(20,24,36,0.45)" strokeWidth="2.4" />
          ))}
          {paths.map((d, i) => (
            <path key={`h${i}`} d={d} stroke="rgba(255,250,240,0.35)" strokeWidth="1" transform="translate(-0.8 -0.8)" />
          ))}
        </g>
        {/* The empty slot: bare box cardboard with a little depth. */}
        {lifted && (
          <g>
            <path d={liftedPath} fill="#9E845A" />
            <path d={liftedPath} fill="#B89C6C" transform="translate(0 7)" clipPath={`url(#${id}-piece)`} />
            <path d={liftedPath} fill="none" stroke="#1F2A44" strokeWidth="3" strokeDasharray="10 7" strokeLinejoin="round" />
          </g>
        )}
      </g>
      <rect width={BOARD_W} height={BOARD_H} rx="6" fill="none" stroke="#1F2A44" strokeWidth="5" />

      {lifted && (
        <g style={{ transformOrigin: `${cx}px ${cy}px` }} className="animate-bob">
          <g transform={`translate(92 -96) rotate(9 ${cx} ${cy})`} filter={`url(#${id}-shadow)`}>
            {/* Cardboard edge under the printed face. */}
            <path d={liftedPath} fill="#C8B18A" transform="translate(3 5)" />
            <g clipPath={`url(#${id}-piece)`}>
              {src ? <image href={src} width={BOARD_W} height={BOARD_H} preserveAspectRatio="xMidYMid slice" /> : <rect width={BOARD_W} height={BOARD_H} fill="#E4572E" />}
            </g>
            <path d={liftedPath} fill="none" stroke="#1F2A44" strokeWidth="3" strokeLinejoin="round" />
          </g>
        </g>
      )}
    </svg>
  );
}

/** A tiny, real jigsaw cut used as the difficulty icon: you see how many pieces you'll get. */
export function CutGlyph({ cols, rows, active, className = '' }: { cols: number; rows: number; active: boolean; className?: string }) {
  const puzzle = useMemo(() => generatePuzzle(7 + cols * 13 + rows, cols, rows), [cols, rows]);
  return (
    <svg viewBox={`-10 -10 ${BOARD_W + 20} ${BOARD_H + 20}`} className={className} aria-hidden>
      <rect width={BOARD_W} height={BOARD_H} rx="18" fill={active ? '#F3A712' : '#E6D5B5'} />
      {puzzle.pieces.map((p) => (
        <path
          key={p.index}
          d={piecePathData(p, p.home.x, p.home.y)}
          fill={(p.col + p.row) % 2 === 0 ? 'rgba(255,250,240,0.35)' : 'transparent'}
          stroke="#1F2A44"
          strokeWidth={active ? 9 : 7}
          strokeLinejoin="round"
          opacity={active ? 1 : 0.55}
        />
      ))}
    </svg>
  );
}

/** One classic piece silhouette (64x64 box), for icons and confetti. */
export const PIECE_D = 'M8 14h14a7 7 0 1 1 14 0h14v14a7 7 0 1 0 0 14v14H36a7 7 0 1 0-14 0H8V42a7 7 0 1 1 0-14z';

export function PieceIcon({ size = 22, fill = 'currentColor', className = '' }: { size?: number; fill?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="4 4 56 56" className={className} aria-hidden>
      <path d={PIECE_D} fill={fill} stroke="#1F2A44" strokeWidth="3.5" strokeLinejoin="round" />
    </svg>
  );
}

const CONFETTI_COLORS = ['#E4572E', '#F3A712', '#2A9D8F', '#6D597A', '#FFFAF0'];

/** Puzzle pieces tumbling down the screen. CSS-only so it costs nothing while solving. */
export function PieceConfetti({ count = 26 }: { count?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 9) * 0.18,
        dur: 2.6 + ((i * 7) % 10) / 6,
        size: 18 + ((i * 11) % 18),
        spin: i % 2 ? 1 : -1,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [count],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden motion-reduce:hidden" aria-hidden>
      <style>{`@keyframes pcfall{0%{transform:translateY(-12vh) rotate(0)}100%{transform:translateY(112vh) rotate(var(--spin))}}`}</style>
      {bits.map((b, i) => (
        <svg
          key={i}
          viewBox="4 4 56 56"
          width={b.size}
          height={b.size}
          className="absolute top-0"
          style={{
            left: `${b.left}%`,
            animation: `pcfall ${b.dur}s ${b.delay}s cubic-bezier(.3,.1,.6,1) both`,
            ['--spin' as string]: `${b.spin * (240 + b.size * 8)}deg`,
          }}
        >
          <path d={PIECE_D} fill={b.color} stroke="#1F2A44" strokeWidth="3.5" strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  );
}
