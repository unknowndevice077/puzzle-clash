import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DIFFICULTY_SPECS, PACK_LABELS, type MatchPlayer } from '@pc/shared';
import { JigsawPicture, PieceConfetti, PieceIcon } from '../components/jigsaw';
import { Icon, formatMs } from '../components/ui';
import { sound } from '../lib/sound';
import { actions } from '../net/actions';
import { serverNow } from '../net/socket';
import { PuzzleBoard } from '../puzzle/PuzzleBoard';
import { useApp, type MatchView } from '../store';

const PLAYER_COLORS = ['#E4572E', '#2A9D8F'];

function useNow(ms = 100): number {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function clock(msLeft: number): string {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A lane per player: their piece token slides along as they place pieces. */
function RaceLane({ p, total, me, color }: { p: MatchPlayer; total: number; me: boolean; color: string }) {
  const pct = total ? Math.min(100, (p.placed / total) * 100) : 0;
  const done = p.finishMs !== null;
  return (
    <div className="flex items-center gap-2" role="progressbar" aria-label={`${p.name}: ${p.placed} of ${total} pieces`} aria-valuenow={p.placed} aria-valuemin={0} aria-valuemax={total}>
      <span className={`w-[4.5rem] shrink-0 truncate text-xs font-bold sm:w-28 ${me ? 'text-paper' : 'text-paper/70'}`}>
        {me ? 'You' : p.name}
        {!p.connected && <span className="text-mustard"> ·…</span>}
      </span>
      <div className="relative h-3 flex-1 rounded-full bg-black/25">
        <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: color }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 140, damping: 22 }} />
        <motion.div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" animate={{ left: `${pct}%` }} transition={{ type: 'spring', stiffness: 140, damping: 22 }}>
          <PieceIcon size={20} fill={color} />
        </motion.div>
      </div>
      <span className="w-14 shrink-0 text-right font-display text-xs font-bold tabular-nums text-paper/90">{done ? formatMs(p.finishMs) : `${p.placed}/${total}`}</span>
    </div>
  );
}

function Countdown({ m, now }: { m: MatchView; now: number }) {
  const left = Math.ceil((m.endsAt - now) / 1000);
  const [last, setLast] = useState(left);
  useEffect(() => {
    if (left !== last && left > 0) sound.tick();
    setLast(left);
  }, [left, last]);
  const spec = DIFFICULTY_SPECS[m.difficulty];
  return (
    <motion.div className="felt fixed inset-0 z-30 grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="w-full max-w-xl text-center">
        <p className="label !text-paper/70">
          Round {m.round} · study the picture · {spec.cols * spec.rows} pieces
        </p>
        <div className="mt-3 rounded-xl2 border-[1.5px] border-ink bg-paper p-2 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
          {m.picture && m.setup ? (
            <JigsawPicture src={m.picture} cols={m.setup.cols} rows={m.setup.rows} seed={m.setup.seed} className="w-full" alt="The finished picture, cut into this round's pieces" />
          ) : (
            <div className="aspect-[4/3] w-full animate-pulse rounded-lg bg-kraft" />
          )}
        </div>
        <motion.div
          key={left}
          className="heading mt-5 inline-grid h-24 w-24 place-items-center rounded-full border-[3px] border-ink bg-mustard text-6xl text-ink shadow-hard"
          initial={{ scale: 1.6, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 16 }}
        >
          {left > 0 ? left : 'Go'}
        </motion.div>
      </div>
    </motion.div>
  );
}

function RoundEnd({ m, me }: { m: MatchView; me: string }) {
  const r = m.lastRound;
  if (!r) return null;
  const winner = m.players.find((p) => p.id === r.winnerId);
  const mine = winner?.id === me;
  const title =
    m.mode === 'solo' ? (r.finishMs[me] !== null ? 'Solved!' : 'Out of time') : !winner ? 'Dead heat' : mine ? 'Round to you' : `${winner.name} takes it`;
  return (
    <motion.div className="fixed inset-0 z-30 grid place-items-center bg-felt-deep/70 p-4 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="card w-full max-w-sm p-5 text-center" initial={{ y: 30, rotate: -2, scale: 0.94 }} animate={{ y: 0, rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
        <p className="label">Round {r.round}</p>
        <h2 className={`heading mt-1 text-3xl ${mine || (m.mode === 'solo' && r.finishMs[me] !== null) ? 'text-tomato' : ''}`}>{title}</h2>
        {r.reason === 'time' && m.mode !== 'solo' && <p className="mt-1 text-sm text-muted">Time ran out, so pieces placed decided it.</p>}
        <ul className="mt-4 space-y-2 text-left">
          {m.players.map((p, i) => (
            <li key={p.id} className={`flex items-center gap-3 rounded-xl border-[1.5px] px-3 py-2 text-sm ${p.id === r.winnerId ? 'border-ink bg-mustard-soft' : 'border-ink/10 bg-table'}`}>
              <PieceIcon size={22} fill={PLAYER_COLORS[i % 2]} />
              <span className="flex-1 truncate font-semibold">
                {p.id === me ? 'You' : p.name}
                {r.newBest.includes(p.id) && <span className="ml-2 rounded-md border border-ink bg-mustard px-1.5 py-0.5 text-[10px] font-extrabold uppercase">New best</span>}
              </span>
              <span className="font-display font-bold tabular-nums">{r.finishMs[p.id] !== null ? formatMs(r.finishMs[p.id]) : `${r.placed[p.id]}/${r.total}`}</span>
            </li>
          ))}
        </ul>
        {m.mode !== 'solo' && <p className="mt-4 text-xs font-semibold text-muted">Next picture is being cut…</p>}
      </motion.div>
    </motion.div>
  );
}

function MatchEnd({ m, me }: { m: MatchView; me: string }) {
  const res = m.result;
  if (!res) return null;
  const winner = m.players.find((p) => p.id === res.winnerId);
  const won = winner?.id === me;
  const voted = m.rematchVotes.includes(me);
  const title = m.mode === 'solo' ? 'Practice done' : !winner ? "It's a tie" : won ? 'You win!' : `${winner.name} wins`;
  return (
    <motion.div className="fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-felt-deep/80 p-4 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {(won || m.mode === 'solo') && <PieceConfetti />}
      <motion.div className="card relative w-full max-w-md p-5 sm:p-6" initial={{ y: 30, rotate: 1.5 }} animate={{ y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
        <p className="label text-center">{res.forfeit ? 'Opponent left the table' : 'Final result'}</p>
        <h2 className={`heading mt-1 text-center text-[42px] leading-none ${won || m.mode === 'solo' ? 'text-tomato' : ''}`}>{title}</h2>
        {m.mode !== 'solo' && (
          <div className="mt-5 flex items-center justify-center gap-5">
            {m.players.map((p, i) => (
              <div key={p.id} className="flex items-center gap-5">
                {i > 0 && <span className="font-display text-2xl text-muted">–</span>}
                <div className="flex flex-col items-center">
                  <span className="relative grid h-16 w-16 place-items-center">
                    <PieceIcon size={64} fill={PLAYER_COLORS[i % 2]} className={`absolute inset-0 ${p.id === res.winnerId ? 'animate-wobble' : ''}`} />
                    <span className="relative font-display text-2xl font-extrabold text-paper">{res.scores[p.id] ?? 0}</span>
                  </span>
                  <span className="mt-1 max-w-[7rem] truncate text-xs font-bold text-muted">{p.id === me ? 'You' : p.name}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {res.rounds.length > 0 && (
        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="pb-1 font-bold">Round</th>
              {m.players.map((p) => (
                <th key={p.id} className="pb-1 text-right font-bold">
                  {p.id === me ? 'You' : p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-dashed divide-ink/15">
            {res.rounds.map((r) => (
              <tr key={r.round}>
                <td className="py-1.5 font-semibold">{r.round}</td>
                {m.players.map((p) => (
                  <td key={p.id} className={`py-1.5 text-right font-display tabular-nums ${r.winnerId === p.id ? 'font-extrabold text-tomato' : ''}`}>
                    {r.finishMs[p.id] !== null ? formatMs(r.finishMs[p.id]) : `${r.placed[p.id]}/${r.total}`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-primary flex-1 !min-h-[50px]" disabled={voted || m.players.some((p) => !p.connected)} onClick={() => void actions.rematch()}>
            <Icon name="repeat" size={18} />
            {m.mode === 'solo' ? 'Another one' : voted ? `Waiting (${m.rematchVotes.length}/${m.players.length})` : m.rematchVotes.length ? 'Accept rematch' : 'Rematch'}
          </button>
          <button type="button" className="btn-secondary flex-1 !min-h-[50px]" onClick={() => void actions.leaveMatch()}>
            Back to the box
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function GameScreen() {
  const m = useApp((s) => s.match);
  const me = useApp((s) => s.profile?.id ?? '');
  const now = useNow(100);
  const [peek, setPeek] = useState(false);
  const [gather, setGather] = useState(0);
  if (!m) return null;

  const spec = DIFFICULTY_SPECS[m.difficulty];
  const total = spec.cols * spec.rows;
  const ordered = [...m.players].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : 0));
  const solving = m.phase === 'SOLVING';
  const myDone = m.players.find((p) => p.id === me)?.finishMs != null;
  const lowTime = solving && m.endsAt - now < 30_000;

  return (
    <div className="felt fixed inset-0 z-20 flex flex-col text-paper">
      <header className="border-b border-black/20 bg-felt-deep/85 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur sm:px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost !min-h-[44px] !min-w-[44px] !px-2 !text-paper hover:!bg-white/10"
            aria-label="Leave match"
            onClick={() => {
              if (m.phase === 'MATCH_END' || window.confirm('Leave the match? Your opponent wins by forfeit.')) void actions.leaveMatch();
            }}
          >
            <Icon name="back" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-sm font-bold leading-tight">{m.mode === 'solo' ? 'Solo practice' : `Round ${m.round} of ${m.bestOf}`}</div>
            <div className="truncate text-[11px] text-paper/60">
              {total} pieces · {PACK_LABELS[m.pack]}
            </div>
          </div>
          {m.mode !== 'solo' && (
            <div className="rounded-lg bg-black/20 px-2 py-1 font-display text-lg font-extrabold tabular-nums" aria-label="Match score">
              <span style={{ color: PLAYER_COLORS[0] }}>{ordered[0]?.score ?? 0}</span>
              <span className="px-1 text-paper/50">:</span>
              <span style={{ color: PLAYER_COLORS[1] }}>{ordered[1]?.score ?? 0}</span>
            </div>
          )}
          <div
            className={`min-w-[70px] rounded-lg border-[1.5px] border-ink px-2 py-1 text-center font-display text-lg font-extrabold tabular-nums text-ink shadow-lift ${lowTime ? 'animate-wobble bg-tomato text-white' : 'bg-paper'}`}
            role="timer"
            aria-label="Time left"
          >
            {solving ? clock(m.endsAt - now) : m.phase === 'COUNTDOWN' ? 'Ready' : '–'}
          </div>
        </div>
        <div className="mt-2 space-y-1.5 px-1">
          {ordered.map((p, i) => (
            <RaceLane key={p.id} p={p} total={total} me={p.id === me} color={PLAYER_COLORS[i % 2]} />
          ))}
        </div>
      </header>

      <main className="relative min-h-0 flex-1 p-2 sm:p-4">
        {m.setup && <PuzzleBoard setup={m.setup} picture={m.picture} assist={spec.assist} active={solving && !myDone} restorePlaced={m.restorePlaced} peek={peek} gatherSignal={gather} />}
        <AnimatePresence>
          {myDone && solving && (
            <motion.div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="card px-4 py-2 text-sm font-bold text-ink">Last piece in! Waiting for the round to end…</div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="flex items-center gap-2 border-t border-black/20 bg-felt-deep/85 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:px-4">
        <button
          type="button"
          className="btn-felt !min-h-[50px] gap-2 !pl-1.5 text-sm"
          onPointerDown={() => setPeek(true)}
          onPointerUp={() => setPeek(false)}
          onPointerLeave={() => setPeek(false)}
          onPointerCancel={() => setPeek(false)}
          onKeyDown={(e) => e.key === ' ' && setPeek(true)}
          onKeyUp={() => setPeek(false)}
          disabled={!solving}
          aria-label="Hold to peek at the finished picture"
        >
          {m.picture ? (
            <img src={m.picture} alt="" className="h-9 w-12 rounded-md border border-paper/40 object-cover" />
          ) : (
            <span className="h-9 w-12 rounded-md bg-black/20" />
          )}
          <span className="leading-tight">
            Hold
            <br className="sm:hidden" /> to peek
          </span>
        </button>
        <button type="button" className="btn-felt !min-h-[50px] text-sm" onClick={() => setGather((n) => n + 1)} disabled={!solving}>
          <Icon name="edges" size={18} /> Edges
        </button>
        <p className="ml-auto hidden max-w-[45%] truncate text-right text-[11px] text-paper/55 sm:block">
          {m.setup?.attribution.title}
          {m.setup?.attribution.author ? ` · ${m.setup.attribution.author}` : ''}
        </p>
      </footer>

      <AnimatePresence>
        {m.phase === 'COUNTDOWN' && <Countdown key={`cd-${m.round}`} m={m} now={now} />}
        {m.phase === 'ROUND_END' && <RoundEnd key={`re-${m.round}`} m={m} me={me} />}
        {m.phase === 'MATCH_END' && <MatchEnd key="end" m={m} me={me} />}
      </AnimatePresence>
    </div>
  );
}
