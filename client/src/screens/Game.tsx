import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DIFFICULTY_SPECS, PACK_LABELS, type MatchPlayer } from '@pc/shared';
import { Icon, formatMs } from '../components/ui';
import { sound } from '../lib/sound';
import { actions } from '../net/actions';
import { serverNow } from '../net/socket';
import { PuzzleBoard } from '../puzzle/PuzzleBoard';
import { useApp, type MatchView } from '../store';

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

function ProgressRow({ p, total, me, color }: { p: MatchPlayer; total: number; me: boolean; color: string }) {
  const pct = total ? (p.placed / total) * 100 : 0;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-semibold">
          {p.name}
          {me && <span className="text-muted"> (you)</span>}
          {!p.connected && <span className="text-tomato"> · reconnecting</span>}
        </span>
        <span className="shrink-0 font-display tabular-nums text-muted">{p.finishMs !== null ? formatMs(p.finishMs) : `${p.placed}/${total}`}</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={`${p.name} progress`} aria-valuenow={p.placed} aria-valuemax={total}>
        <motion.div className="h-full rounded-full" style={{ background: color }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 140, damping: 22 }} />
      </div>
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
  return (
    <motion.div className="fixed inset-0 z-30 grid place-items-center bg-table/90 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="w-full max-w-xl text-center">
        <p className="label">Round {m.round} · study the picture</p>
        <div className="card mt-3 overflow-hidden p-2">
          {m.picture ? <img src={m.picture} alt="The finished picture" className="aspect-[4/3] w-full rounded-lg object-cover" /> : <div className="aspect-[4/3] w-full animate-pulse rounded-lg bg-line" />}
        </div>
        <motion.div key={left} className="heading mt-4 text-7xl text-tomato" initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
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
  const title =
    m.mode === 'solo' ? (r.finishMs[me] !== null ? 'Solved!' : 'Out of time') : !winner ? 'Round drawn' : winner.id === me ? 'You took the round' : `${winner.name} took the round`;
  return (
    <motion.div className="fixed inset-0 z-30 grid place-items-center bg-ink/40 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="card w-full max-w-sm p-6 text-center" initial={{ y: 20, scale: 0.96 }} animate={{ y: 0, scale: 1 }}>
        <p className="label">Round {r.round}</p>
        <h2 className="heading mt-1 text-3xl">{title}</h2>
        {r.reason === 'time' && m.mode !== 'solo' && <p className="mt-1 text-sm text-muted">Time ran out, so pieces placed decided it.</p>}
        <ul className="mt-4 space-y-2 text-left">
          {m.players.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-lg bg-table px-3 py-2 text-sm">
              <span className="font-semibold">
                {p.name}
                {r.newBest.includes(p.id) && <span className="ml-2 rounded-md bg-mustard-soft px-1.5 py-0.5 text-xs font-bold text-ink">New best</span>}
              </span>
              <span className="font-display tabular-nums">{r.finishMs[p.id] !== null ? formatMs(r.finishMs[p.id]) : `${r.placed[p.id]}/${r.total}`}</span>
            </li>
          ))}
        </ul>
        {m.mode !== 'solo' && <p className="mt-4 text-sm text-muted">Next round starting…</p>}
      </motion.div>
    </motion.div>
  );
}

function MatchEnd({ m, me }: { m: MatchView; me: string }) {
  const res = m.result;
  if (!res) return null;
  const winner = m.players.find((p) => p.id === res.winnerId);
  const voted = m.rematchVotes.includes(me);
  const title = m.mode === 'solo' ? 'Practice complete' : !winner ? "It's a tie" : winner.id === me ? 'You win!' : `${winner.name} wins`;
  return (
    <motion.div className="fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-ink/45 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="card w-full max-w-md p-6" initial={{ y: 24 }} animate={{ y: 0 }}>
        <p className="label text-center">{res.forfeit ? 'Opponent left' : 'Final result'}</p>
        <h2 className={`heading mt-1 text-center text-4xl ${winner?.id === me || m.mode === 'solo' ? 'text-tomato' : ''}`}>{title}</h2>
        {m.mode !== 'solo' && (
          <div className="mt-4 flex items-center justify-center gap-4 font-display text-3xl tabular-nums">
            {m.players.map((p, i) => (
              <span key={p.id} className="flex items-center gap-3">
                {i > 0 && <span className="text-muted">–</span>}
                <span className="text-center">
                  {res.scores[p.id] ?? 0}
                  <span className="block text-xs font-body font-semibold text-muted">{p.name}</span>
                </span>
              </span>
            ))}
          </div>
        )}
        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-1 font-semibold">Round</th>
              {m.players.map((p) => (
                <th key={p.id} className="pb-1 text-right font-semibold">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {res.rounds.map((r) => (
              <tr key={r.round}>
                <td className="py-1.5">{r.round}</td>
                {m.players.map((p) => (
                  <td key={p.id} className={`py-1.5 text-right font-display tabular-nums ${r.winnerId === p.id ? 'text-tomato' : ''}`}>
                    {r.finishMs[p.id] !== null ? formatMs(r.finishMs[p.id]) : `${r.placed[p.id]}/${r.total}`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-primary flex-1" disabled={voted || m.players.some((p) => !p.connected)} onClick={() => void actions.rematch()}>
            <Icon name="repeat" size={18} />
            {m.mode === 'solo' ? 'Play again' : voted ? `Waiting (${m.rematchVotes.length}/${m.players.length})` : m.rematchVotes.length ? 'Accept rematch' : 'Rematch'}
          </button>
          <button type="button" className="btn-secondary flex-1" onClick={() => void actions.leaveMatch()}>
            Back to home
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
  const colors = ['#E4572E', '#2A9D8F'];
  const solving = m.phase === 'SOLVING';
  const myDone = m.players.find((p) => p.id === me)?.finishMs != null;

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-table">
      <header className="border-b border-line bg-card/90 px-3 pb-2 pt-2 backdrop-blur sm:px-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-ghost !min-h-[40px] !px-2"
            aria-label="Leave match"
            onClick={() => {
              if (m.phase === 'MATCH_END' || window.confirm('Leave the match? Your opponent wins by forfeit.')) void actions.leaveMatch();
            }}
          >
            <Icon name="back" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-bold leading-tight">
              {m.mode === 'solo' ? 'Solo practice' : `Round ${m.round} · best of ${m.bestOf}`}
            </div>
            <div className="text-xs text-muted">
              {spec.label} · {total} pieces · {PACK_LABELS[m.pack]}
            </div>
          </div>
          {m.mode !== 'solo' && (
            <div className="font-display text-xl font-bold tabular-nums" aria-label="Score">
              {ordered.map((p) => p.score).join(' – ')}
            </div>
          )}
          <div className={`min-w-[64px] rounded-lg px-2 py-1 text-center font-display text-lg font-bold tabular-nums ${solving && m.endsAt - now < 30_000 ? 'bg-tomato text-white' : 'bg-table'}`} role="timer">
            {solving ? clock(m.endsAt - now) : m.phase === 'COUNTDOWN' ? 'Ready' : '–'}
          </div>
        </div>
        <div className="mt-2 flex gap-4">
          {ordered.map((p, i) => (
            <ProgressRow key={p.id} p={p} total={total} me={p.id === me} color={colors[i % 2]} />
          ))}
        </div>
      </header>

      <main className="relative min-h-0 flex-1 p-2 sm:p-4">
        {m.setup && <PuzzleBoard setup={m.setup} picture={m.picture} assist={spec.assist} active={solving && !myDone} restorePlaced={m.restorePlaced} peek={peek} gatherSignal={gather} />}
        {myDone && solving && (
          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
            <div className="card px-4 py-2 text-sm font-semibold">Finished! Waiting for the round to end…</div>
          </div>
        )}
      </main>

      <footer className="flex items-center gap-2 border-t border-line bg-card/90 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-5">
        <button
          type="button"
          className="btn-secondary !min-h-[42px] text-sm"
          onPointerDown={() => setPeek(true)}
          onPointerUp={() => setPeek(false)}
          onPointerLeave={() => setPeek(false)}
          onKeyDown={(e) => e.key === ' ' && setPeek(true)}
          onKeyUp={() => setPeek(false)}
          disabled={!solving}
        >
          <Icon name="eye" size={18} /> Hold to peek
        </button>
        <button type="button" className="btn-secondary !min-h-[42px] text-sm" onClick={() => setGather((n) => n + 1)} disabled={!solving}>
          <Icon name="edges" size={18} /> Edges first
        </button>
        <p className="ml-auto hidden max-w-[45%] truncate text-right text-xs text-muted sm:block">
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
