import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { DIFFICULTIES, DIFFICULTY_SPECS, PACK_LABELS, type BestTimeEntry, type Difficulty, type PicturePack } from '@pc/shared';
import { Icon, Logo, formatMs } from '../components/ui';
import { isMuted, setMuted } from '../lib/sound';
import { actions } from '../net/actions';
import { api } from '../net/api';
import { useApp } from '../store';

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const difficultyOptions = DIFFICULTIES.map((d) => ({ value: d, label: `${DIFFICULTY_SPECS[d].label} · ${DIFFICULTY_SPECS[d].cols * DIFFICULTY_SPECS[d].rows}` }));

function ActionCard({ accent, icon, title, blurb, children }: { accent: string; icon: ReactNode; title: string; blurb: string; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${accent}`}>{icon}</span>
        <div>
          <h2 className="heading text-xl">{title}</h2>
          <p className="text-sm text-muted">{blurb}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function NameChip() {
  const profile = useApp((s) => s.profile);
  const setApp = useApp((s) => s.set);
  const toast = useApp((s) => s.toast);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.session(name.trim());
      setApp({ profile: res.profile });
      setEditing(false);
    } catch (err) {
      toast({ kind: 'error', message: err instanceof Error ? err.message : 'Could not rename' });
    }
  };

  if (!profile) return null;
  if (editing) {
    return (
      <form onSubmit={save} className="flex items-center gap-2">
        <label htmlFor="name" className="sr-only">
          Your name
        </label>
        <input id="name" className="input !min-h-[40px] w-40" autoFocus maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn-secondary !min-h-[40px]" aria-label="Save name">
          <Icon name="check" size={18} />
        </button>
      </form>
    );
  }
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-xl px-2 py-1 text-left hover:bg-ink/5"
      onClick={() => {
        setName(profile.name);
        setEditing(true);
      }}
    >
      <span className="grid h-9 w-9 place-items-center rounded-full bg-ink font-display text-sm font-bold text-white">{profile.name.slice(0, 1).toUpperCase()}</span>
      <span className="min-w-0">
        <span className="block max-w-[92px] truncate text-sm font-bold leading-tight sm:max-w-none">{profile.name}</span>
        <span className="hidden text-xs text-muted sm:block">
          {profile.wins}W · {profile.losses}L · tap to rename
        </span>
      </span>
    </button>
  );
}

function BestTimes() {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [rows, setRows] = useState<BestTimeEntry[] | null>(null);
  const mine = useApp((s) => s.profile?.bestTimes);
  useEffect(() => {
    setRows(null);
    api
      .best(difficulty)
      .then(setRows)
      .catch(() => setRows([]));
  }, [difficulty]);
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="heading flex items-center gap-2 text-xl">
          <Icon name="trophy" /> Fastest solves
        </h2>
        <Segmented label="Difficulty" value={difficulty} options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_SPECS[d].label }))} onChange={setDifficulty} />
      </div>
      <p className="mt-2 text-sm text-muted">
        Your best: <span className="font-semibold text-ink tabular-nums">{formatMs(mine?.[difficulty] ?? null)}</span>
      </p>
      <ol className="mt-3 divide-y divide-line">
        {rows === null && <li className="py-3 text-sm text-muted">Loading…</li>}
        {rows?.length === 0 && <li className="py-3 text-sm text-muted">No finished puzzles yet. Set the first record.</li>}
        {rows?.slice(0, 8).map((r) => (
          <li key={`${r.position}-${r.name}`} className="flex items-center gap-3 py-2 text-sm">
            <span className={`w-6 font-display font-bold ${r.position === 1 ? 'text-tomato' : 'text-muted'}`}>{r.position}</span>
            <span className="flex-1 truncate font-semibold">{r.name}</span>
            <span className="font-display tabular-nums">{formatMs(r.ms)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Home() {
  const navigate = useNavigate();
  const [roomDiff, setRoomDiff] = useState<Difficulty>('medium');
  const [pack, setPack] = useState<PicturePack>('ghibli');
  const [quickDiff, setQuickDiff] = useState<Difficulty>('medium');
  const [soloDiff, setSoloDiff] = useState<Difficulty>('easy');
  const [soloPack, setSoloPack] = useState<'ghibli' | 'photos'>('ghibli');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [muted, setMute] = useState(isMuted());

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6">
      <header className="flex items-center justify-between gap-2">
        <Logo />
        <div className="flex min-w-0 items-center gap-0.5">
          <NameChip />
          <button
            type="button"
            className="btn-ghost !px-2"
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
            onClick={() => {
              setMuted(!muted);
              setMute(!muted);
            }}
          >
            <Icon name={muted ? 'mute' : 'sound'} />
          </button>
        </div>
      </header>

      <section className="mt-8 grid items-center gap-6 md:grid-cols-[1.2fr_1fr]">
        <div className="animate-rise">
          <p className="label">Real-time jigsaw races</p>
          <h1 className="heading mt-2 text-4xl leading-[1.05] sm:text-5xl">
            Same picture. Same pieces.
            <br />
            <span className="text-tomato">Fastest hands win.</span>
          </h1>
          <p className="mt-3 max-w-md text-muted">
            You and your opponent get an identical jigsaw cut from the same picture. Watch their progress bar climb while you race to place the last piece.
          </p>
        </div>
        <HeroArt />
      </section>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        <ActionCard accent="bg-tomato text-white" icon={<Icon name="users" />} title="Play a friend" blurb="Private room with a code and QR. Works great on the same Wi-Fi.">
          <div className="space-y-2">
            <div className="label">Difficulty</div>
            <Segmented label="Difficulty" value={roomDiff} options={difficultyOptions} onChange={setRoomDiff} />
          </div>
          <div className="space-y-2">
            <div className="label">Pictures</div>
            <Segmented label="Pictures" value={pack} options={(['ghibli', 'photos', 'custom'] as const).map((p) => ({ value: p, label: PACK_LABELS[p] }))} onChange={setPack} />
          </div>
          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const room = await actions.createRoom(roomDiff, 3, pack);
                if (room) navigate(`/room/${room.code}`);
              })
            }
          >
            Create room
          </button>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim().length === 5) navigate(`/join/${code.trim().toUpperCase()}`);
            }}
          >
            <label htmlFor="code" className="sr-only">
              Room code
            </label>
            <input id="code" className="input uppercase tracking-[0.2em] placeholder:normal-case placeholder:tracking-normal" placeholder="Have a code?" maxLength={5} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <button type="submit" className="btn-secondary">
              Join
            </button>
          </form>
        </ActionCard>

        <ActionCard accent="bg-mustard text-ink" icon={<Icon name="bolt" />} title="Quick match" blurb="Get paired with anyone online. Studio Ghibli pictures, best of three.">
          <div className="space-y-2">
            <div className="label">Difficulty</div>
            <Segmented label="Difficulty" value={quickDiff} options={difficultyOptions} onChange={setQuickDiff} />
          </div>
          <div className="flex-1" />
          <button type="button" className="btn-secondary w-full" disabled={busy} onClick={() => void run(() => actions.joinQueue(quickDiff))}>
            Find an opponent
          </button>
        </ActionCard>

        <ActionCard accent="bg-teal text-white" icon={<Icon name="timer" />} title="Solo practice" blurb="Beat your own best time before you challenge someone.">
          <div className="space-y-2">
            <div className="label">Difficulty</div>
            <Segmented label="Difficulty" value={soloDiff} options={difficultyOptions} onChange={setSoloDiff} />
          </div>
          <div className="space-y-2">
            <div className="label">Pictures</div>
            <Segmented label="Pictures" value={soloPack} options={(['ghibli', 'photos'] as const).map((p) => ({ value: p, label: PACK_LABELS[p] }))} onChange={setSoloPack} />
          </div>
          <button type="button" className="btn-secondary w-full" disabled={busy} onClick={() => void run(() => actions.solo(soloDiff, soloPack))}>
            Start practice
          </button>
        </ActionCard>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <BestTimes />
        <section className="card p-5">
          <h2 className="heading text-xl">How a match works</h2>
          <ol className="mt-4 space-y-4">
            {[
              ['Get ready', 'A three-second countdown shows the finished picture. Take a good look.'],
              ['Race', 'Drag pieces onto the board. A piece clicks into place when it is close to its spot. Tap "Edges first" to sort the border pieces.'],
              ['Win the round', 'First to place every piece takes the round. If time runs out, most pieces placed wins. First to two rounds wins the match.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.5px] border-ink font-display text-sm font-bold">{i + 1}</span>
                <div>
                  <h3 className="font-display font-bold">{t}</h3>
                  <p className="text-sm text-muted">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="mt-10 text-center text-xs text-muted">
        Scene stills © Studio Ghibli, released by the studio for free use. Nature & places photos from Unsplash (Unsplash License).
      </footer>
    </main>
  );
}

/** Three interlocking pieces, slightly apart, as a small illustration. */
function HeroArt() {
  const piece = 'M0 20h22a10 10 0 1 1 20 0h22v22a10 10 0 1 0 0 20v22H42a10 10 0 1 1-20 0H0V62a10 10 0 1 0 0-20z';
  return (
    <div className="relative mx-auto h-48 w-full max-w-sm" aria-hidden>
      <svg viewBox="0 0 260 180" className="h-full w-full">
        <g transform="translate(30 30) rotate(-8 42 52)">
          <path d={piece} fill="#E4572E" stroke="#1F2A44" strokeWidth="3" strokeLinejoin="round" />
        </g>
        <g transform="translate(110 20) rotate(6 42 52)">
          <path d={piece} fill="#F3A712" stroke="#1F2A44" strokeWidth="3" strokeLinejoin="round" />
        </g>
        <g transform="translate(160 76) rotate(-4 42 52)">
          <path d={piece} fill="#2A9D8F" stroke="#1F2A44" strokeWidth="3" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}
